// SPDX-License-Identifier: Apache-2.0
import { Designer } from '@pdfme/ui';
import { checkTemplate, type Template, type Plugins, type UIOptions } from '@pdfme/common';
import { invoicePlugins } from './pdf.js';

/** Browser-only. Application owns template storage, revision checks, font assets and publication. */
export function mountPdfDesigner(element: HTMLElement, options: {
  template: Template; onChange: (template: Template) => void; onSave: (template: Template) => void;
  plugins?: Plugins; ui?: UIOptions;
}) {
  checkTemplate(options.template);
  const designer = new Designer({ domContainer: element, template: structuredClone(options.template), plugins: options.plugins ?? invoicePlugins, options: options.ui });
  designer.onChangeTemplate(template => options.onChange(structuredClone(template)));
  designer.onSaveTemplate(template => options.onSave(structuredClone(template)));
  return { getTemplate: () => structuredClone(designer.getTemplate()),
    setTemplate(template: Template) { checkTemplate(template); designer.updateTemplate(structuredClone(template)); },
    destroy: () => designer.destroy() };
}
