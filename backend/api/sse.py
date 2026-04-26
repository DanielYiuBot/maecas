"""SSE streaming helpers for real-time pipeline progress."""

import asyncio
import json
import logging

logger = logging.getLogger(__name__)


class SSEManager:
    """Broadcasts progress events to each SSE connection and replays history.

    A single asyncio.Queue is a work queue, not a broadcast channel. EventSource
    reconnects can briefly create multiple consumers, so every connection needs
    its own queue while the manager keeps a short per-job event history.
    """

    def __init__(self):
        self._history: dict[str, list[dict]] = {}
        self._subscribers: dict[str, set[asyncio.Queue]] = {}

    def create_queue(self, job_id: str) -> None:
        """Ensure job state exists.

        Kept as the public setup method because pipeline startup already calls
        it before emitting the first progress event.
        """
        if job_id not in self._history:
            self._history[job_id] = []
            self._subscribers[job_id] = set()
            logger.info("SSE job stream created | job_id=%s", job_id)
        else:
            logger.debug("SSE job stream reused | job_id=%s", job_id)

    def subscribe(self, job_id: str) -> asyncio.Queue:
        self.create_queue(job_id)
        q: asyncio.Queue = asyncio.Queue()

        for event in self._history[job_id]:
            q.put_nowait(event)

        self._subscribers[job_id].add(q)
        logger.info(
            "SSE subscriber added | job_id=%s | replayed=%d | subscribers=%d",
            job_id,
            len(self._history[job_id]),
            len(self._subscribers[job_id]),
        )
        return q

    def unsubscribe(self, job_id: str, q: asyncio.Queue):
        subscribers = self._subscribers.get(job_id)
        if subscribers is None:
            return
        subscribers.discard(q)
        logger.info(
            "SSE subscriber removed | job_id=%s | subscribers=%d",
            job_id,
            len(subscribers),
        )

    def remove_queue(self, job_id: str):
        self._history.pop(job_id, None)
        self._subscribers.pop(job_id, None)
        logger.info("SSE job stream removed | job_id=%s", job_id)

    async def send_event(
        self,
        job_id: str,
        stage: str,
        agent: str,
        status: str,
        progress_pct: int,
        message: str,
    ):
        self.create_queue(job_id)
        event = {
            "stage": stage,
            "agent": agent,
            "status": status,
            "progress_pct": progress_pct,
            "message": message,
        }
        self._history[job_id].append(event)

        subscribers = list(self._subscribers[job_id])
        for q in subscribers:
            await q.put(event)

        logger.debug(
            "SSE event sent | job_id=%s | stage=%s | agent=%s | status=%s | pct=%d | subscribers=%d",
            job_id, stage, agent, status, progress_pct, len(subscribers),
        )


sse_manager = SSEManager()


def make_progress_callback(job_id: str):
    """Create the async progress callback to pass into GraphState."""

    async def callback(
        stage: str = "agents",
        agent: str = "",
        status: str = "running",
        progress_pct: int = 0,
        message: str = "",
    ):
        await sse_manager.send_event(
            job_id=job_id,
            stage=stage,
            agent=agent,
            status=status,
            progress_pct=progress_pct,
            message=message,
        )

    return callback


def format_sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"
