# Forms, page editing and input primitives

Original Apache-2.0 React adapters combine JSON Forms validation, Puck page blocks, conditional draft persistence, accessible dialog alternatives and phone/masked inputs. Import only the selected entrypoints; each feature remains editable source.

## Install, runtime and styles

Run from this directory with Node 24:

```sh
npm ci --ignore-scripts
npm test
```

The isolated lock pins JSON Forms 3.8, Puck 0.23, Radix Dialog 1.2, React Aria Components 1.22, libphonenumber-js 1.13 and IMask 7.6. The exact versions are in `package.json`. React/ReactDOM 18.3 or 19 fit declared peers; actual local verification used Node 24.19.0 and React/ReactDOM 19.3.0. Keep client components in the browser boundary. The JSON and revision helpers can run on a server.

Import `src/styles.css` into the host's selected stylesheet layer. Puck additionally requires:

```ts
import '@puckeditor/core/puck.css';
```

Override the pack's CSS custom properties/classes for typography, spacing, colors and focus styles. Radix and React Aria components provide behavior, not a complete application design system.

## Forms and contact inputs

`SchemaForm<T>` takes `schema`, optional `uischema`, controlled `data`/`onChange`, and async `onSubmit(data, signal)`. It validates the submit snapshot, reports errors, suppresses overlapping submissions, disables inputs while saving and aborts on unmount. Custom JSON Forms renderers and button labels are props. The fixtures contain nested fields and a conditional requirement; reuse their shape with application-owned schema definitions. `createFormValidator` provides the same AJV validation independently. Revalidate and authorize the data on the server; hiding a field in a UI schema does not restrict writes. Restrict schema size/complexity if schemas come from users. See [JSON Forms React integration](https://jsonforms.io/docs/integrations/react/).

`PhoneInput` preserves the raw input and reports E.164, possible/valid status, inferred country and extension using full libphonenumber metadata. Supply the default country explicitly when known. Parse a complete number rather than extracting one from unrelated text. A valid number does not establish reachability or ownership. `MaskedInput` uses IMask's actual instance lifecycle and exposes unmasked values; memoize its `options` to avoid unnecessary reinitialization. Masks format input and do not replace semantic validation. Both components use explicit labels. See [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js) and [IMask](https://imask.js.org/).

## Draft and publication adapters

`DocumentEnvelope<T>` has `id`, `schemaVersion`, opaque `revision` and `data`. A `DocumentStore<T>` implements `load` and conditional `save`. `createHttpDocumentStore` requires a same-origin root-relative endpoint such as `/api/pages`; it supplies GET/PUT operations, explicit parse/header/fetch adapters, bounded response bytes/timeouts and `If-Match` writes. The server must authorize each document and atomically compare the revision; return 409 or 412 on conflict. A client header alone provides no concurrency guarantee.

`DraftSession` tracks saved revision, current data, dirty/saving state and errors. Edits made during an outstanding save remain dirty when that save completes. Save requests coalesce while one is pending. A conflict preserves local edits for an application-owned reconciliation flow. `migrateDocument` applies sequential version migrations and validates the result; it rejects newer or missing versions. Do not infer that a draft was published from a successful save.

`PageEditor` wraps real Puck and defaults to original Heading, Paragraph and CallToAction blocks. `PublishedPage` uses Puck Render. Supply `initial`, a stable `store`, optional `config`, and an explicit `publish(savedEnvelope)` callback. Publication saves the selected snapshot first and requires server-side publication rights/revision checks. Remount/key the editor when document ID or store identity changes. Neither drafts nor publication are stored automatically.

`parsePageData` validates this starter's **flat** registered block set, string properties and unique IDs. Extend both configuration and validation for custom blocks, slots or nested zones; do not accept a custom schema using the flat validator. Supplied blocks escape text and constrain links to HTTPS or internal root paths. They do not render arbitrary HTML or executable content. See [Puck's component contract](https://puckeditor.com/docs/api-reference/components/puck).

## Dialog alternatives and evidence

`RadixActionDialog` and `AriaActionDialog` share `ActionDialogProps` for trigger, title, description and body. Choose one primitive system per application when possible. Each uses the upstream focus/portal/dialog behavior and a visible close action. Test the surrounding flow and nested portals on actual devices; rendered trigger markup alone cannot establish accessibility. Upstream references: [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog), [React Aria Dialog](https://react-spectrum.adobe.com/react-aria/Dialog.html).

Six local tests cover actual JSON Forms/AJV and Puck server rendering, malicious text/link handling, conditional revision conflicts, concurrent edits, phone parsing and dialog trigger markup. Browser drag/drop, focus/keyboard, screen readers, IMask events and a real persistence/publication backend were not exercised. React 18 was not executed. These limits are retained in the manifest.

The glue is Apache-2.0. JSON Forms, Puck, Radix, libphonenumber-js and IMask retain MIT terms; React Aria retains Apache-2.0 terms. Preserve metadata/dependency notices. Puck Cloud/AI services, commercial content and copied marketplace blocks are outside this pack. Update pins together with the peer matrix and behavior tests.
