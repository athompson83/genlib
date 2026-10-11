// SPDX-License-Identifier: Apache-2.0
#let invoice = json(sys.inputs.invoice)
#set page(paper: "a4", margin: 20mm)
#set text(size: 10pt)
#set heading(numbering: none)
= Invoice #invoice.id
#invoice.seller

Bill to: #invoice.customer \
Issued: #invoice.issuedOn

#table(
  columns: (1fr, auto, auto, auto),
  inset: 7pt,
  align: (left, right, right, right),
  table.header([*Item*], [*Quantity*], [*Unit price*], [*Total*]),
  ..invoice.lines.map(line => ([#line.description], [#line.quantity], [#line.unit], [#line.total])).flatten(),
)

#align(right)[
  Subtotal: #invoice.subtotal \
  Tax: #invoice.tax \
  Shipping: #invoice.shipping \
  Discount: #invoice.discount \
  *Total: #invoice.total*
]
