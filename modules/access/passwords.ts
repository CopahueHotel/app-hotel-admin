const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const unhex=(value:string)=>Uint8Array.from(value.match(/../g)??[],b=>parseInt(b,16));
export async function digest(value:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
export async function hashPassword(password:string){
 if(password.length<12||password.length>256)throw Error('La contraseña debe tener entre 12 y 256 caracteres.');
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},key,256);
 return `pbkdf2-sha256:600000:${hex(salt)}:${hex(new Uint8Array(bits))}`;
}
export async function passwordMatches(password:string,stored:string){
 if(!/^pbkdf2-sha256:600000:[a-f0-9]{32}:[a-f0-9]{64}$/.test(stored))return false;
 const [,iterations,salt,expected]=stored.split(':');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations:Number(iterations)},key,256));
 const wanted=unhex(expected);let difference=0;
 for(let i=0;i<actual.length;i++)difference|=actual[i]^wanted[i];
 return difference===0;
}
