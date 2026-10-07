'use client';

import { Input } from '@/components/ui/input';
export function NumberField({label,name,value,required=true}:{label:string;name:string;value?:number;required?:boolean}) {
 return <label className="field"><span>{label}</span><Input name={name} type="number" min="0" step="0.01" defaultValue={value} required={required}/></label>;
}
export function TextField({label,name,value='',required=false,readOnly=false}:{label:string;name:string;value?:string;required?:boolean;readOnly?:boolean}) {
 return <label className="field"><span>{label}</span><Input name={name} defaultValue={value} required={required} readOnly={readOnly} maxLength={name==='responsible'?240:1000}/></label>;
}