# Calendar and file trees

Original Apache-2.0 adapters provide explicit event rules, React Big Calendar rendering, standards-library iCalendar output and controlled React Arborist mutations. Storage, availability and permissions are injected by the receiving application.

## Install and styles

From this directory:

```sh
npm ci --ignore-scripts
npm test
```

Node 24.19.0 and React/ReactDOM 19.3.0 were used locally. Node 22.12+ on the 22 release line or Node 24+ matches the pack engine; Node 23 is excluded by ical-generator's engine. React 18.3 and 19 are peer-compatible, but React 18 was not executed. Pins are React Big Calendar 1.20, ical-generator 11.1, React Arborist 3.16 and date-fns 4.4; retain the lockfile.

Import `src/styles.css` and the calendar stylesheet in the client entrypoint:

```ts
import 'react-big-calendar/lib/css/react-big-calendar.css';
```

Provide definite calendar/tree height and tree width. Override pack classes/tokens for the application's design. Calendar locale/localizer, controlled date/view, navigation and selection are props.

## Event and export contract

`CalendarEvent` uses a stable ID, title, start/end, all-day flag, monotonic sequence and update instant. Timed values require an explicit ISO UTC marker or offset. All-day values use strict `YYYY-MM-DD` dates with an **exclusive end date**. Invalid rollover dates, duplicate IDs and reversed/empty ranges fail. A multi-day event ending October 12 includes dates before October 12. Increment `sequence` and update `updatedAt` when a published event changes.

`Scheduler` wraps the actual [React Big Calendar](https://github.com/bigcalendar/react-big-calendar). Supply controlled date/view and callbacks for navigation, event selection and selected slots; the callback does not persist a booking. The default date-fns localizer is en-US. Timed events render in the browser's local time zone, which is labeled in the component. This profile does not pretend that a browser-local calendar is an arbitrary venue-zone calendar. Use an explicit zone-aware presentation profile if your product needs one, and test DST boundaries.

`exportCalendar(events, { name, domain })` uses [ical-generator](https://github.com/sebbo2002/ical-generator). Timed output uses UTC, all-day output uses date values, and IDs become stable UIDs scoped to an application-owned domain. Sequence/stamp/last-modified come from the model so fixture output is deterministic. No incomplete VTIMEZONE block is fabricated. Exported text may be returned as an attachment using the application's own authorized download route. Recurrence expansion, cancellation feeds, invitation delivery, subscription hosting and external calendar synchronization are separate work.

## Controlled tree contract

`FileNode` has stable `id`, display `name`, `kind` and optional child nodes. Names are normalized; IDs are globally unique, and sibling names are unique without case distinctions. The validation budget is 10,000 nodes and depth 100. Display names/IDs are not filesystem paths.

`renameNode`, `removeNodes`, `insertNode` and `moveNodes` return new trees. Movement uses React Arborist's actual pre-removal index convention; it supports same-parent and cross-parent moves, rejects cycles/ancestor-and-descendant selection and prevents moving into a file. Identity remains stable across moves. `FileTree` provides create, rename, delete, drag/move and activation through controlled callbacks. A pending write excludes overlapping commits; the host must still compare durable revisions atomically. See [React Arborist](https://github.com/jameskerr/react-arborist).

Supply `onChange(nextTree)` for authorized persistence, `onCreate` for application-generated IDs and `onActivate` for navigation. Resolve deletion confirmation and edit permissions in the product. Do not treat hiding an action as authorization, use display paths for disk writes, or silently discard a failed write. `onError` surfaces adapter failures; the prior controlled tree remains authoritative until the host accepts a change.

## Evidence and license boundaries

Four tests exercise actual ical-generator output around DST and all-day events, reject invalid dates, and validate React Arborist-compatible same-parent/cross-parent moves, insert/delete and cycle/name conflicts. TypeScript compiles both real React widget APIs. Browser navigation/drag/drop/keyboard behavior and importing output into calendar clients were not exercised. The receiving project must test booking conflicts, atomic tree writes, device/accessibility behavior and its own time-zone/locale requirements.

The direct upstream projects retain MIT terms; the glue is Apache-2.0. This pack does not include commercial calendar extensions or hosted calendar services. Review peer and engine requirements together with date/time behavior whenever updating pins.
