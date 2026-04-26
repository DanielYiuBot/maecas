# Refinitiv StreetEvents Transcripts and Briefs Datafeed

**User Guide**
Document Version 3.0 | Date of issue: May 2020
Author: Faraz Chohan | Contributors: Jayvee Nasol, Mildred Eballa

---

## Contents

- [Content Overview](#content-overview)
- [Product Structure](#product-structure)
- [File Formats and Available Metadata](#file-formats-and-available-metadata)
- [Transcripts Versions](#transcripts-versions)
- [Setting Up the Feed](#setting-up-the-feed)
- [Delivery Mechanism](#delivery-mechanism)
- [Files Access](#files-access)
- [Timeliness](#timeliness)
- [Archive Files](#archive-files)
- [Frequently Asked Questions](#frequently-asked-questions)
- [Get Support](#get-support)

---

## Content Overview

### Transcripts and Briefs

Refinitiv Transcripts are verbatim representations of corporate and institutional events. These are considered **True Transcripts** – manually created, typing out exactly what is heard on the event. Refinitiv Briefs on the other hand, are unbiased summaries of corporate and institutional events. These are summarized versions of Transcripts.

### Coverage

Our transcripts coverage includes approximately **7,200 global companies**. Our briefs coverage includes about **1,000 companies**. The history for both briefs and transcripts goes back to 2001. Over time, the coverage numbers for each respective content set has grown to what it is today.

---

## Product Structure

### Types of Events Covered and their Values

**Table 1. Types of Events Covered and their Values**

| Event Type ID | Event Type Name | Description and Additional Notes |
|---|---|---|
| 1 | Earnings Conference Call / Presentation | An Earnings Call is a scheduled conference call conducted between the management of a public company, analysts, investors and the media to discuss the financial results during a given reporting period such as a quarter or a fiscal year. An Earnings Presentation however is similar in nature but is conducted in person. |
| 5 | Corporate Conference Call / Presentation | A Corporate Call is a scheduled conference call conducted between the management of a publicly traded company, analysts, investors, and the Press, around miscellaneous subjects not covered by Earnings, Guidance, M&A, or Corporate Sales. These can include management changes, responses to activists, and conversations around new or existing products. This includes special calls which could include various subtypes including, but not limited to, agreements, asset sale update, corporate strategy, creditors, funds update, fixed income, etc. |
| 7 | Conference Presentation | A Conference Presentation is a specific presentation given in person at a Corporate Conference. Covers Conference Presentations of all companies in the S&P 500 and Russell 1000 indices presenting at Conferences. Also covers Conference Presentations for events held by the top investment banks: Goldman Sachs, JPMorgan, Morgan Stanley, Credit Suisse Group AG, Barclays, Bank of America Merrill Lynch, Citigroup, Deutsche Bank, Lazard Ltd, UBS AG. |
| 8 | Other Corporate | Industry Specific Calls / Presentations which are scheduled conference calls, or presentations in person, conducted between the management of a public company, analysts, investors and the media to discuss the company's key performance indicators related to the industry they operate in during a given reporting period such as a quarter or a fiscal year. |
| 11 | Shareholders Annual Meeting | An Annual Shareholders Meeting (ASM) is a mandatory, public yearly gathering of a publicly traded company's executives, directors and interested shareholders. |
| 21 | Analyst Conference Call | An Analyst Call is a scheduled conference call where the management of a company gives updates to their analysts, investors or the bigger financial market, usually around a specific subject, outside the scope of Ordinary and Extraordinary Shareholder Meetings. |
| 22 | Institutional Analyst Meeting | An analyst meeting, hosted by an investment bank or buy side firm, is a scheduled meeting conducted in person where the management of that company gives updates to their analysts, investors or the bigger financial market, usually around a specific subject, outside the scope of Ordinary and Extraordinary Shareholder Meetings. |
| 30 | Guidance Call / Presentation | A Guidance Call is a conference call in which members of the management of a publicly-traded company provide information to shareholders on the company's projected earnings for a quarter or year. A Guidance Presentation has the same nature but is conducted in person. |
| 31 | Corporate Analyst Meeting | An analyst meeting, hosted by a particular company, is a scheduled meeting conducted in person where the management of that company gives updates to their analysts, investors or the bigger financial market, usually around a specific subject, outside the scope of Ordinary and Extraordinary Shareholder Meetings. |
| 33 | Sales / Trading Statement Call / Presentation | A Corporate Sales Call is a conference call conducted by representatives of a company where they discuss their latest Corporate Sales Release with potential buyers. A Trading Statement Call is a scheduled conference call conducted by members of the management of a company where they elaborate on their latest Trading Statement Release with shareholders. This also includes Interim Management Statement Calls. |
| 34 | Merger and Acquisition Announcement | This includes M&A calls which are conference calls hosted by members of the management of one or more corporations involved in a merger or acquisition to their shareholders and analysts. |

---

## File Formats and Available Metadata

The transcripts and briefs files are available in the following main formats:

**Table 2. Main Formats Available**

| Format | Description |
|---|---|
| XML | The XML format of the files contains metadata at the top and bottom of the file with the body of the Transcript in plain text in between. |
| PDF | The PDF format represents the actual transcript or brief and goes with a supplemental XML file containing metadata to identify the documents. |

Each of these files shares a common linking in that they use the unique event ID within the naming convention. An Event ID is a unique identifier that is used to distinguish an event from another event.

The typical file name takes the following convention: **`5010421_T.xml`**, where:

- The number prefix is the **event ID**
- The letter suffix indicates the **document type**: `T` for Transcript, `B` for Brief
- The extension indicates the **format type**: `.xml` or `.pdf`

### Folder Structure

**Table 3. Folder Structure**

When users access the server, they will see a folder for Transcripts or Briefs, or both (based on their subscription). Within those folders they will see sub-folders for XML files or PDF files, or both (based on their subscription). In each of those sub-folders, they will see the following directory structure:

| Folder | Description |
|---|---|
| Current | This folder will contain all the files for the current calendar month (from 1st of the month, till last day of the month). On 1st of next month, the files from this current folder for the previous month will be moved to the Archive folder for that year. For example: on 1st August 2020, all files in the current folder for month of July (1st July 2020 to 31st July 2020) will be moved to Archive/2020 folder. **NB.** If an update for an older transcript is posted, for example for a file from 2010, the updated file will not be archived into the 2010 folder but in the folder of the year the update was posted. So, in this example, the updated file will be placed in the 2020 Archive folder. |
| Archive | Archive folder will have yearly sub-folders, starting from 2001. Each of these subfolders will have all the files for that year. |

### File Structure

Each file is divided into three parts:

1. Metadata at the start of the transcript/brief
2. Body, where the actual transcript/brief sits
3. Metadata at the end of the transcript/brief

**Example of a standard metadata at the start of a transcript:**

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<Event Id="8863280" lastUpdate="Thursday, March 8, 2018 at 4:07:08pm GMT"
  eventTypeId="1" eventTypeName="Earning Conference Call/Presentation">
  <EventStory Id="8863280.P" expirationDate="Thursday, March 8, 2018 at 3:00:00pm GMT"
    action="publish" storyType="transcript" version="Preliminary">
    <Headline><![CDATA[Preliminary Transcript of KR earnings conference call or presentation
      8-Mar-18 3:00pm GMT]]></Headline>
```

**Example of a standard body of a transcript:**

```xml
<Body><![CDATA[Q4 2017 Kroger Co Earnings Call
Body of Transcript
]]></Body>
```

**Example of a standard metadata at the end of a transcript:**

```xml
</EventStory>
  <eventTitle><![CDATA[Q4 2017 Kroger Co Earnings Call]]></eventTitle>
  <city>Cincinnati</city>
  <companyName>Kroger Co</companyName>
  <companyTicker>KR</companyTicker>
  <startDate>8-Mar-18 3:00pm GMT</startDate>
</Event>
```

**Example of metadata with additional identifiers at the end of a transcript** *(Available to users with CUSIP, SEDOL and ISIN License):*

```xml
</EventStory>
  <eventTitle><![CDATA[Q4 2018 FedEx Corp Earnings Call]]></eventTitle>
  <city>Memphis</city>
  <companyName>FedEx Corp</companyName>
  <companyTicker>FDX</companyTicker>
  <startDate>19-Jun-18 9:00pm GMT</startDate>
  <companyId>73289</companyId>
  <CUSIP>31428X106</CUSIP>
  <SEDOL>2142784</SEDOL>
  <ISIN>US31428X1063</ISIN>
</Event>
```

**Example of a standard metadata at the start of a brief:**

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<Event Id="11305192" lastUpdate="Tuesday, October 23, 2018 at 7:51:20pm GMT"
  eventTypeId="1" eventTypeName="Earning Conference Call/Presentation">
  <EventStory Id="11305192.F" expirationDate="Tuesday, October 23, 2018 at 12:30:00pm GMT"
    action="publish" storyType="brief" version="Final">
    <Headline><![CDATA[Edited Brief of CNC earnings conference call or presentation 23-Oct-18
      12:30pm GMT]]></Headline>
```

**Example of a standard body of a brief:**

```xml
<Body><![CDATA[Q3 2018 Centene Corp Earnings Call
Body of Brief
]]></Body>
```

**Example of a standard metadata at the end of a brief:**

```xml
</EventStory>
  <eventTitle><![CDATA[Q3 2018 Twitter Inc Earnings Call]]></eventTitle>
  <city>San Francisco</city>
  <companyName>Twitter Inc</companyName>
  <companyTicker>TWTR</companyTicker>
  <startDate>25-Oct-18 12:00pm GMT</startDate>
</Event>
```

### Metadata Descriptions

**Table 4. Metadata Descriptions**

| Element | Description |
|---|---|
| Event Id | This is a unique internal system-generated identifier that is used to distinguish an event from another event. The user can use this to select specific events based on the selected Event Type. |
| companyId | This is the unique internal system-generated identifier that is used to distinguish a company from another company. This can be used to map an event to a company. |
| lastUpdate | This refers to the date and time when the transcript was last published. e.g. "Thursday, March 8, 2018 at 4:07:08pm GMT" |
| eventTypeId | This is the numerical value of what type of event the transcript or brief is for (See Table 1). |
| eventTypeName | This identifies to what kind of event the transcript and brief is for and the value associated with the eventTypeId (See Table 1). |
| EventStory Id | This replicates the Event Id of the event. |
| expirationDate | This marks the date and time when the event is scheduled to take place. e.g. "Thursday, March 8, 2018 at 4:07:08pm GMT" |
| action | "publish" – the transcript or brief is created and available. "delete" – the transcript or brief was unpublished or pulled down from the products; one reason could be due to duplication (NB. Clients are asked to delete transcripts from their systems if the action is "delete"). |
| storyType | "transcript" – the file is a transcript of an event. "brief" – the file is a brief of an event. |
| version | This tells what version of the transcript is (See Table 5). |
| eventTitle | This is the title of the event. e.g. "Q1 2018 Apple Inc Earnings Conference Call" |
| city | This indicates the city where the company resides. |
| companyName | This is the name of the company that hosted the event. |
| companyTicker | This is the Primary ticker identifier of the company. |
| startDate | Same with expirationDate, this tells when the event is scheduled to take place. |
| EventName | This is the same with the eventTitle element. e.g. "Q1 2018 Calumet Specialty Products Partners LP Earnings Call" |
| Ric | This is the Primary RIC identifier of the company. |
| EventStartDate | This is the same with the startDate element. |
| DocumentStatus | This is the same with the version element. |

---

## Transcripts Versions

**Table 5. Transcript Versions**

| Version | Description |
|---|---|
| Preliminary | This is the initial version of the transcript and is as good as the final version content-wise. |
| Edited | In this version, grammatical mistakes are fixed, and other corrections are done. |
| Audited | If the transcript still needs additional changes, it will go through further data quality checking processes. Once done, it is already the Audited Version. |
| Redlined | This version arises from requests from the company who hosted the event. This version includes their specific corrections on speaker names, spellings, figures, and so on. |

On average, there should be no more than four versions of a transcript. The transcript files can go through a number of edits from a "preliminary" status to an "edited" status. The edits and republish may not be limited to one single time either. For instance, a transcript could be changed to edited and then edited again for auditing purposes or further corrections. So, there isn't really a limitation to the amount of times a file could change.

---

## Setting Up the Feed

To set up the Refinitiv StreetEvents Transcripts and Briefs Datafeed, we will need the following information:

- Type of data required (Transcripts, Briefs, or both)
- Preferred format (XML or PDF)
- Would you need historical data?
- Emergency contact name, e-mail information, phone number

---

## Delivery Mechanism

Refinitiv Transcripts and Briefs feed will be setup as FTP/SFTP pull feed through the hosted Refinitiv servers. Data files will be generated and made available on:

**Server:** `ftp-setranscripts.refinitiv.com`

---

## Files Access

Users can access the files from the server link mentioned above. Any time the user picks up a new file, user should check if they have a similar file in their database. For those users looking to build Point-in-Time data, should store each update to the file separately. Otherwise, we recommend users to override the older version of the transcripts they already have as transcripts come in multiple versions as shown in Table 5. This is to make sure that the additional updates made within certain transcripts are captured.

---

## Timeliness

This is entirely dependent on the type of event, length of the call, audio quality, the production volume in a specific day, and also based on when the event ends. Live transcript production typically produces preliminary transcripts by the time an event has ended. For multi-hour events, transcripts can sometimes take up to 24 hours to be published. On average, our turnaround time for both transcripts and briefs is 4-6 hours. We recommend users to download files once every hour.

**Table 6. Average Turnaround Time**

| | Average, In Hours | |
|---|---|---|
| | Domestic Files | International Files |
| Peak | 4:00 | 6:00 |
| Non-Peak | 2:30 | 5:30 |

---

## Archive Files

Historical data files are available in the server organized by yearly folders. To date, there are about 430,000+ transcripts and 94,000+ briefs files available in our database. XML files have an average size of 70KB for transcripts, 50KB for briefs. PDF files have an average of 250KB for transcripts, 200KB for briefs.

An average of 2,700 transcripts are produced every month, while an average of 8,200 transcripts are produced quarterly.

---

## Frequently Asked Questions

### Product FAQs

**Does the XML version of transcript divide the content into a presentation and a Q&A section?**

Yes. It indicates whether a portion of the transcript is either the presentation or the Question and Answer section.

**Do you get the additional identifiers on the trial?**

Yes, you can get the additional identifiers for trials too.

**Is there a limit to how many files you can download when on the trial?**

No. You can download all the files that are present on the trial account.

**It seems those transcripts can be modified after upload. Can you explain what sorts of modifications I should expect? Are they simple corrections (typos, other misspellings, etc.) or more substantive changes (changing tickers or dates, updated content which was missing previously, etc.)?**

While transcript files can go through a number of edits from a preliminary status to an edited status, the preliminary version is as good as the final version in terms of content. The difference of the preliminary version and the succeeding versions is that, the succeeding versions have been proofread; simple corrections were made such as grammatical mistakes, punctuations, typos, etc. These are the edits you can expect. Substantive changes are hardly ever to anticipate. We avoid substantive modifications through using supplemental information like press releases, slide presentations, quarterly and annual reports, and other materials from the company to ensure accuracy and to confirm terminology and financials.

**Do your transcripts signify a date when the earnings call was written into your dataset, and when it was made available to its subscribers?**

There is no time stamp for the time when the transcript was first published. We only have the "lastUpdate," which marks the last publish date of the transcript.

**How does transcripts data handle merger or acquisition of two entities? If Company A gets acquired by Company B?**

If Company A gets acquired by Company B, all transcripts of Company A get reassigned to Company B and going forward you will see transcripts flowing under Company B identifier.

**I can't seem to find old transcripts for Company X. I think it's because of the company's CUSIP change. How does transcripts data handle CUSIP changes? Delistings?**

Transcripts are produced using the most current CUSIP values. If a company had a CUSIP change, the new CUSIP will be used for on-going and future transcripts. If you have stored Company X's old transcripts data, you will be able to access them using the old CUSIP. Delisted companies have their securities identifiers removed – only company names will be available.

**I only want transcripts for US companies. Can you set that up for me?**

We cannot provide region specific transcripts – the feed will provide transcripts for all regions. We would recommend using the available identifiers for you to parse the data.

**Would you supply 'unchecked' and 'proofed' versions of the transcript files? How would that work?**

The feed will give you both the preliminary as well as the edited versions of the transcript. The edited version comes with the same file name. When accessing the files, please check if you have a similar file in their db.

---

### Content FAQs

**What is the city included in the transcripts? Is it the location of the event or the address of the company?**

The city in the beginning of the transcript should be the domicile city of the company hosting the event. Cities will differ if the company in question had been part of a recent merger/acquisition. Archive files are not overridden.

**I'm looking at an Analyst Call event by Company Y hosted by Company Z. Why does the primary RIC in the transcript show Company Z? It should be Company Y, right?**

No. The primary RIC will show the company hosting the event. In the feed, you will see a 'Sponsor' and a 'Subject' where the 'Sponsor' is the firm hosting the event and the 'Subject' is the company presenting to that same event.

**Do you transcribe an entire conference? Do you cover individual presentations?**

We only transcribe presentations of company presenters and not all conference speakers.

**What languages are available?**

We only have English transcripts currently.

**We were reviewing the transcript product, we realize that it did not cover all the stocks in US — why is this the case?**

We follow our coverage criteria that are based on several factors such as major indices listing, significant market cap, user requests, significant market following, etc. We also only include those companies that are very active in conducting English calls and those that are active in hosting the specific event types mentioned in Table 1. If we do not cover companies, most likely these do not holistically meet the criteria mentioned.

**How is the transcript data originated? Are there any intermediaries between Refinitiv and the company? Does Refinitiv have exclusive use of the data?**

The content has been created by transcript operations sourced from Refinitiv or vendors hired directly by Refinitiv. Refinitiv has copyright for exclusive use of data where we have vendor information.

**What kind of data quality and assurance controls do you implement on the transcripts?**

Our transcript writers use supplemental information like press releases, slide presentations, quarterly and annual reports, and other materials from the company to ensure accuracy and to confirm terminology and financials. We have a rigorous auditing and verification program in place to ensure an ongoing high level of quality and to address any quality concerns quickly.

While there are times when accents, audio issues, or other problems make comprehension difficult, writers are encouraged to avoid using (inaudible) unless they absolutely have to. Instead, they use phonetic spellings (enclosed in brackets) when comprehension issues arise to ensure that users get as much information as possible.

**What is your typical turnaround time for transcripts?**

4-6 hours after the event ends is the average, but higher priority transcripts that are streamed live are typically turned around sooner than that and longer more difficult events are turned around later than that. Peak earnings season can also extend the turnaround time of transcripts as well.

**What is your turnaround time for Redlines?**

We send it as soon as it hits the first final stage (Edited version). As we do not have control as to when the client will return the revised Redline, we review and publish the redline as soon as we receive it. However, we cannot put a definite timeframe for publishing as it will depend on, but not limited to:

- Number of edits
- Audio quality
- Speaker accent

**What is your conference presentation transcript coverage?**

S&P 500 and Russell 1000 companies are covered. Also, we cover all companies presenting at major conferences hosted by the following:

- Goldman Sachs
- JP Morgan
- Morgan Stanley
- Credit Suisse Group AG
- Barclays
- Bank of America
- Citigroup
- Deutsche Bank AG
- Lazard Ltd
- UBS AG

---

## Get Support

### Contact Us

Get support through **MyRefinitiv**, a single online entry point to Refinitiv support and service functions. Through MyRefinitiv, you can search, view FAQs and User Guides, raise tickets, and track support for your queries online.

- Log in to [my.refinitiv.com](https://my.refinitiv.com)
- Please select **Refinitiv StreetEvents Transcripts & Briefs Datafeeds** as product when you raise a ticket.

### Notifications

View product change notifications, service alerts, and product information including user guides through the Refinitiv notifications portal.

For more information on how to subscribe to Notifications, Alerts, or how to Raise a Query, please check the respective documents listed below:

- A Guide to Viewing & Subscribing to Data Notifications
- How to Subscribe to Product Change Notifications
- The Service Alerts Subscriptions Guide
- How to raise a client query
