type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

const configuredLevel: LogLevel =
  (import.meta.env.VITE_LOG_LEVEL as LogLevel) || 'debug'

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[configuredLevel]
}

function ts(): string {
  return new Date().toISOString().slice(11, 23)
}

function fmt(ctx: string, msg: string): string {
  return `${ts()} [${ctx}] ${msg}`
}

export const logger = {
  debug(ctx: string, msg: string, data?: unknown) {
    if (!shouldLog('debug')) return
    if (data !== undefined) {
      console.debug(fmt(ctx, msg), data)
    } else {
      console.debug(fmt(ctx, msg))
    }
  },

  info(ctx: string, msg: string, data?: unknown) {
    if (!shouldLog('info')) return
    if (data !== undefined) {
      console.info(fmt(ctx, msg), data)
    } else {
      console.info(fmt(ctx, msg))
    }
  },

  warn(ctx: string, msg: string, data?: unknown) {
    if (!shouldLog('warn')) return
    if (data !== undefined) {
      console.warn(fmt(ctx, msg), data)
    } else {
      console.warn(fmt(ctx, msg))
    }
  },

  error(ctx: string, msg: string, data?: unknown) {
    if (!shouldLog('error')) return
    if (data !== undefined) {
      console.error(fmt(ctx, msg), data)
    } else {
      console.error(fmt(ctx, msg))
    }
  },

  group(ctx: string, label: string) {
    if (!shouldLog('debug')) return
    console.groupCollapsed(fmt(ctx, label))
  },

  groupEnd() {
    if (!shouldLog('debug')) return
    console.groupEnd()
  },
}
