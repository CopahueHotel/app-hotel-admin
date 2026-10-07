import { can,operationPermissions,type Identity } from '@/modules/access/permissions';
export async function authorizeOperation(db:D1Database,identity:Identity,action:string,data:Record<string,unknown>){
 const required=operationPermissions(action,data);
 if(action==='bookingEdit'){
  const previous=await db.prepare('SELECT benefit,reason,barter_agreement,discount_amount,price_mode FROM booking_terms WHERE booking=?').bind(data.id).first<{benefit:string;reason:string;barter_agreement:string;discount_amount:number;price_mode:string}>();
  const benefit=previous?.benefit??'Habitual';
  if(data.benefit!==benefit||String(data.barterAgreement??'')!==(previous?.barter_agreement??''))required.push('reservations.special');
  if(previous&&(previous.benefit!=='Habitual'||previous.discount_amount>0||previous.price_mode==='Acordado')&&String(data.reason??'')!==previous.reason)required.push('reservations.special');
  // Removing an existing discount also changes the economic agreement.
  if(data.priceMode!=='Conservar'&&(previous?.discount_amount??0)>0)required.push('reservations.discount');
 }
 if(['beverageDispatch','sale'].includes(action)&&!['Cortesía','Interno','Incluida'].includes(String(data.kind??data.destination))){
  const normal=data.product&&data.product!=='none'?await db.prepare('SELECT price FROM products WHERE id=?').bind(data.product).first<{price:number}>():await db.prepare("SELECT CAST(value AS INTEGER) price FROM settings WHERE key='mealPrice'").first<{price:number}>();
  if(normal&&Math.round(Number(data.price)*100)!==normal.price)required.push('restaurant.price');
 }
 if(required.some(p=>!can(identity,p)))throw Error('HOT_FORBIDDEN');
 return required;
}
