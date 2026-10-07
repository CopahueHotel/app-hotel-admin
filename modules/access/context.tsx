'use client';

import { Button } from '@/components/ui/button';
import { can,type PublicIdentity } from '@/modules/access/permissions';
import { createContext,useContext,type ComponentProps,type ReactNode } from 'react';
const AccessContext=createContext<PublicIdentity|null>(null);
export function AccessProvider({identity,children}:{identity:PublicIdentity;children:ReactNode}){return <AccessContext.Provider value={identity}>{children}</AccessContext.Provider>;}
export const useIdentity=()=>useContext(AccessContext);
export function Allowed({permission,children}:{permission:string;children:ReactNode}){const identity=useIdentity();return !identity||can(identity,permission)?children:null;}
export function ActionButton({permission,anyPermission,...props}:ComponentProps<typeof Button>&{permission?:string|string[];anyPermission?:string[]}){
 const identity=useIdentity();
 if(identity&&permission&&(Array.isArray(permission)?permission.some(p=>!can(identity,p)):!can(identity,permission)))return null;
 if(identity&&anyPermission&&!anyPermission.some(p=>can(identity,p)))return null;
 return <Button {...props}/>;
}
export function SessionResponsible(){const identity=useIdentity();return identity?<p className="form-note">Responsable: {identity.name} · {identity.email}</p>:null;}
