// SPDX-License-Identifier: Apache-2.0
import { Body, Container, Head, Heading, Html, Preview, Section, Text, render, toPlainText } from 'react-email';
import { invoiceView, type InvoiceDocument } from './invoice.js';

/** Original transactional layout. No provider, mailing list, or send call is included. */
export function InvoiceEmail({ invoice, locale = 'en-US', accent = '#174b8f' }: { invoice: InvoiceDocument; locale?: string; accent?: string }) {
  const view = invoiceView(invoice, locale);
  return <Html lang={locale.split('-')[0]}><Head /><Preview>Invoice {view.id}: {view.total}</Preview>
    <Body style={{ backgroundColor: '#f4f6f8', fontFamily: 'Arial, sans-serif', color: '#17202a', margin: 0 }}>
      <Container style={{ maxWidth: 600, margin: '24px auto', padding: 32, backgroundColor: '#fff' }}>
        <Heading as="h1" style={{ color: accent }}>Invoice {view.id}</Heading><Text>{view.seller}</Text>
        <Text>Bill to: {view.customer}<br />Issued: {view.issuedOn}</Text>
        <Section><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>
          <th scope="col" align="left">Item</th><th scope="col" align="right">Qty</th><th scope="col" align="right">Total</th>
        </tr></thead><tbody>{view.lines.map(line => <tr key={line.id}><td style={{ padding: '10px 0' }}>{line.description}</td><td align="right">{line.quantity}</td><td align="right">{line.total}</td></tr>)}</tbody></table></Section>
        <Text>Subtotal: {view.subtotal}<br />Tax: {view.tax}<br />Shipping: {view.shipping}<br />Discount: {view.discount}</Text>
        <Heading as="h2">Total: {view.total}</Heading>
      </Container>
    </Body></Html>;
}
export async function renderInvoiceEmail(invoice: InvoiceDocument, options: { locale?: string; accent?: string } = {}) {
  const html = await render(<InvoiceEmail invoice={invoice} {...options} />);
  return { html, text: toPlainText(html, { selectors: [{ selector: 'table', format: 'dataTable' }] }), subject: `Invoice ${invoice.id}` };
}
