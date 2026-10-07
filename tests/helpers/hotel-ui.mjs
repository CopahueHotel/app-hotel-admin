import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
const require=createRequire(import.meta.url);
const caches=new WeakMap();
export function loadUi(f,file){
 const cache=caches.get(f)??new Map();caches.set(f,cache);
 function load(path){
  if(cache.has(path))return cache.get(path);
  const exports={},code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;cache.set(path,exports);
  new Function('require','exports',code)(name=>{
   if(name==='@/components/ui/button')return {Button:props=>{const attrs={...props};delete attrs.variant;return React.createElement('button',attrs);}};
   if(name==='@/components/ui/input')return {Input:props=>React.createElement('input',props)};
   if(name.startsWith('@/lib/'))return f.load(name.slice(2)+'.ts');
   if(name.startsWith('@/components/'))return load(name.slice(2)+'.tsx');
   if(name.startsWith('@/modules/'))return existsSync(name.slice(2)+'.tsx')?load(name.slice(2)+'.tsx'):f.load(name.slice(2)+'.ts');
   return require(name);
  },exports);return exports;
 }
 return load(file);
}
