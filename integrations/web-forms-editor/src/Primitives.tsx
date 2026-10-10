// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Button, Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from 'react-aria-components';

export interface ActionDialogProps {
  trigger: string;
  title: string;
  description: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function RadixActionDialog(props: ActionDialogProps) {
  return <RadixDialog.Root open={props.open} onOpenChange={props.onOpenChange}>
    <RadixDialog.Trigger asChild><button type="button">{props.trigger}</button></RadixDialog.Trigger>
    <RadixDialog.Portal><RadixDialog.Overlay className="genlib-overlay" />
      <RadixDialog.Content className="genlib-dialog"><RadixDialog.Title>{props.title}</RadixDialog.Title>
        <RadixDialog.Description>{props.description}</RadixDialog.Description>{props.children}
        <RadixDialog.Close asChild><button type="button">Close</button></RadixDialog.Close>
      </RadixDialog.Content></RadixDialog.Portal>
  </RadixDialog.Root>;
}

export function AriaActionDialog(props: ActionDialogProps) {
  return <DialogTrigger isOpen={props.open} onOpenChange={props.onOpenChange}>
    <Button>{props.trigger}</Button>
    <ModalOverlay className="genlib-overlay" isDismissable><Modal className="genlib-dialog">
      <Dialog>{({ close }) => <><Heading slot="title">{props.title}</Heading><p>{props.description}</p>{props.children}
        <Button onPress={close}>Close</Button></>}</Dialog>
    </Modal></ModalOverlay>
  </DialogTrigger>;
}
