import type { PurchaseEdit } from '@/modules/purchases/operations';
import type { Add } from '@/modules/shared/operations';
import type { Identity } from '@/modules/access/permissions';
import type { HotelTables } from '@/lib/hotel-types';
import { appendAttachments } from '@/modules/purchases/attachments';
export async function planPurchaseEdit(db:D1Database,d:PurchaseEdit,add:Add,identity:Identity){
 const previous=await db.prepare('SELECT * FROM expenses WHERE id=?').bind(d.expense).first<HotelTables['expenses']>();
 const document=await db.prepare('SELECT * FROM purchase_documents WHERE expense=?').bind(d.expense).first<HotelTables['purchase_documents']>();
 if(!previous||!document)throw Error('Los gastos históricos sin detalle requieren regularización; no se pueden reinterpretar.');
 if(d.received)throw Error('La edición no recibe productos. Usá Recibir para registrar mercadería.');
 const beforeLines=(await db.prepare('SELECT * FROM purchase_lines WHERE expense=? ORDER BY id').bind(d.expense).all<HotelTables['purchase_lines']>()).results;
 const known=new Set(beforeLines.map(l=>l.id));
 if(d.lines.some(l=>l.id&&!known.has(l.id))||new Set(d.lines.filter(l=>l.id).map(l=>l.id)).size!==d.lines.filter(l=>l.id).length)throw Error('Revisá las líneas de este gasto.');
 if(d.type==='Productos'&&!d.lines.length||d.type!=='Productos'&&d.lines.length)throw Error('Revisá la clase y los productos del gasto.');
 const lines=d.lines.map(l=>({...l,id:l.id||crypto.randomUUID(),cost:Math.round(l.cost*100),amount:Math.round(l.qty*Math.round(l.cost*100))}));
 const amount=d.type==='Productos'?lines.reduce((n,l)=>n+l.amount,0):Math.round(d.amount*100);
 if(amount<=0||amount>10000000000)throw Error('Revisá el importe del gasto.');
 add('INSERT INTO purchase_edit_guards VALUES (?,?)',d.expense,d.version);
 add('UPDATE expenses SET date=?,due=?,supplier=?,label=?,area=?,category=?,amount=?,kind=? WHERE id=?',d.date,d.due,d.supplier,d.label,d.area,d.type==='Productos'?'Productos':d.category,amount,d.kind,d.expense);
 add('UPDATE purchase_documents SET invoice=?,type=?,observation=? WHERE expense=?',d.invoice,d.type,d.observation,d.expense);
 for(const l of beforeLines)if(!lines.some(n=>n.id===l.id))add('DELETE FROM purchase_lines WHERE id=? AND expense=?',l.id,d.expense);
 for(const l of lines){if(known.has(l.id))add('UPDATE purchase_lines SET product=?,category=?,qty=?,cost=?,amount=? WHERE id=? AND expense=?',l.product,l.category,l.qty,l.cost,l.amount,l.id,d.expense);
  else add('INSERT INTO purchase_lines VALUES (?,?,?,?,?,?,?)',l.id,d.expense,l.product,l.category,l.qty,l.cost,l.amount);
 }
 const files=await appendAttachments(add,d.expense,d.files,identity);
 add('DELETE FROM purchase_edit_guards WHERE expense=?',d.expense);
 return {before:{expense:previous,document,lines:beforeLines},after:{expense:{...previous,...d,amount,files:undefined,lines:undefined,received:undefined},lines,files}};
}
