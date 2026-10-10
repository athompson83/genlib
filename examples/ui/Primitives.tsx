import { useId, useState, type CSSProperties, type ReactNode } from "react";
export interface ThemeProps { className?: string; style?: CSSProperties }
export function InfoBox({title,children,tone="neutral",className="",style}: ThemeProps & {title:string;children:ReactNode;tone?:"neutral"|"success"|"warning"|"error"}) {
 return <aside role={tone==="error"?"alert":"note"} data-tone={tone} className={className} style={style}><strong>{title}</strong><div>{children}</div></aside>;
}
export function Disclosure({title,children,open=false,className="",style}:ThemeProps & {title:string;children:ReactNode;open?:boolean}) {
 return <details open={open} className={className} style={style}><summary>{title}</summary><div>{children}</div></details>;
}
export function Modal({title,children,onClose,className="",style}:ThemeProps & {title:string;children:ReactNode;onClose:()=>void}) {
 const id=useId();
 return <div role="presentation" className={className} style={style}><section role="dialog" aria-modal="true" aria-labelledby={id}><h2 id={id}>{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog">×</button>{children}</section></div>;
}
export function SiteHeader({brand,children,className="",style}:ThemeProps & {brand:ReactNode;children?:ReactNode}) {
 return <header className={className} style={style}><div>{brand}</div><nav aria-label="Primary">{children}</nav></header>;
}
export function SiteFooter({children,className="",style}:ThemeProps & {children:ReactNode}) {
 return <footer className={className} style={style}>{children}</footer>;
}
export function TermsAcceptance({version,label,onChange}: {version:string;label:string;onChange:(accepted:boolean,version:string)=>void}) {
 const [checked,setChecked]=useState(false);
 return <label><input type="checkbox" checked={checked} onChange={e=>{setChecked(e.target.checked);onChange(e.target.checked,version)}}/>{label}</label>;
}
