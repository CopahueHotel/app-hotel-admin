import { accessGuard } from '@/lib/hotel-auth';
import type { HotelData } from '@/lib/hotel-types';
import { can,type Identity } from '@/modules/access/permissions';
export const hotelTables=['rooms','bookings','products','stock_movements','sales','expenses','cash_movements','daily_closes','settings','meal_overrides','audit_log','room_rates','booking_terms','room_blocks','booking_guests','meal_suspensions','meal_services','meal_plans','beverage_accounts','beverage_dispatches','beverage_settlements','beverage_transfers','beverage_returns','beverage_corrections','purchase_documents','purchase_lines','purchase_receipts','supplier_payment_details','suppliers','supplier_deliveries','menu_plans','menu_actuals'] as const;
export async function readHotelData(db:D1Database,identity:Identity){
 const has=(p:string)=>can(identity,p),reservation=has('reservations.view'),restaurant=has('restaurant.view'),food=has('meals.view')||has('menu.view')||restaurant;
 const financial=has('cash.view')||has('reports.view'),bookingMoney=reservation&&has('reservations.balance'),purchaseMoney=has('purchases.view')&&has('purchases.financial');
 const queries:Partial<Record<typeof hotelTables[number],string>>={};
 if(reservation||has('rooms.view')||food){
  queries.rooms=reservation||has('rooms.view')?'SELECT * FROM rooms':'SELECT id,type FROM rooms';
  queries.bookings=reservation?(bookingMoney?'SELECT * FROM bookings':'SELECT id,guest,phone,room,start,end,pax,regime,meal,status,source,note FROM bookings'):'SELECT id,guest,room,start,end,pax,regime,meal,status FROM bookings';
 }
 if(has('rooms.view'))queries.room_blocks='SELECT * FROM room_blocks';
 if(has('tariffs.view'))queries.room_rates='SELECT * FROM room_rates';
 if(bookingMoney)queries.booking_terms='SELECT * FROM booking_terms';
 if(food||reservation){
  for(const t of ['booking_guests','meal_overrides','meal_suspensions','meal_services','meal_plans'] as const)queries[t]=`SELECT * FROM ${t}`;
 }
 if(has('menu.view')||restaurant){queries.menu_plans='SELECT * FROM menu_plans';queries.menu_actuals='SELECT * FROM menu_actuals';}
 if(has('stock.view')){queries.stock_movements='SELECT * FROM stock_movements';queries.products=has('stock.configure')||restaurant&&has('restaurant.prices')?'SELECT * FROM products':'SELECT id,name,category,unit,minimum,location FROM products';}
 else if(restaurant)queries.products=has('restaurant.prices')?"SELECT * FROM products WHERE category='Bebidas'":"SELECT id,name,category,unit FROM products WHERE category='Bebidas'";
 if(bookingMoney||restaurant&&has('restaurant.prices'))queries.sales='SELECT * FROM sales';
 else if(food)queries.sales="SELECT id,date,booking,customer,label,qty,kind,service FROM sales WHERE kind='Incluida'";
 if(restaurant){for(const t of ['beverage_accounts','beverage_returns'] as const)queries[t]=`SELECT * FROM ${t}`;
  if(has('restaurant.prices'))for(const t of ['beverage_dispatches','beverage_settlements','beverage_transfers','beverage_corrections'] as const)queries[t]=`SELECT * FROM ${t}`;
 }
 if(has('purchases.view')){
  queries.expenses=purchaseMoney?'SELECT * FROM expenses':'SELECT id,date,supplier,label,area,category,kind FROM expenses';
  queries.purchase_documents='SELECT * FROM purchase_documents';
  queries.purchase_lines=purchaseMoney?'SELECT * FROM purchase_lines':'SELECT id,expense,product,category,qty FROM purchase_lines';
  queries.purchase_receipts='SELECT * FROM purchase_receipts';
  if(purchaseMoney)queries.supplier_payment_details='SELECT * FROM supplier_payment_details';
  if(!queries.products)queries.products='SELECT id,name,category,unit,minimum,location FROM products';
 }
 if(has('suppliers.view')){queries.suppliers='SELECT * FROM suppliers';queries.supplier_deliveries='SELECT * FROM supplier_deliveries';}
 if(financial){queries.cash_movements='SELECT * FROM cash_movements';queries.daily_closes='SELECT * FROM daily_closes';}
 else if(bookingMoney||purchaseMoney)queries.cash_movements=`SELECT * FROM cash_movements WHERE ${[bookingMoney?"kind='Cobro' AND ref IN (SELECT id FROM bookings)":'',purchaseMoney?"kind='Pago' AND ref IN (SELECT id FROM expenses)":''].filter(Boolean).map(s=>'('+s+')').join(' OR ')}`;
 if(financial&&!queries.expenses)queries.expenses='SELECT * FROM expenses';
 if(has('settings.view')||restaurant&&has('restaurant.prices'))queries.settings="SELECT * FROM settings WHERE key='mealPrice'";
 const guard=accessGuard(db,identity),tables=hotelTables.filter(t=>queries[t]);
 const results=await db.batch([guard.start,...tables.map(t=>db.prepare(queries[t]!)),guard.end]);
 const data=Object.fromEntries(hotelTables.map(t=>[t,[]])) as unknown as HotelData;
 tables.forEach((t,i)=>{(data[t] as unknown[])=results[i+1].results;});
 // Audit detail can contain prices, contacts and internal notes. Fetch histories
 // only for authorized domains and never include staff/user events here.
 const allowed:string[]=[];
 if(has('meals.view'))allowed.push('guestProfile','meal','mealSuspend','mealServe','mealPlan','mealPlanStatus');
 if(has('menu.view'))allowed.push('menuPlan','menuCopy','menuActual');
 if(has('suppliers.view'))allowed.push('supplierProfile','deliveryGenerate','deliveryEdit');
 if(bookingMoney)allowed.push('booking','bookingEdit','barter','status','payment');
 if(has('tariffs.view'))allowed.push('rate');
 if(has('rooms.view'))allowed.push('block','unblock','room');
 if(restaurant&&has('restaurant.prices'))allowed.push('sale','beverageAccount','beverageDispatch','beverageSettle','beverageReturn','beverageCorrect');
 if(purchaseMoney)allowed.push('purchase','expense','purchaseDocument','purchaseReceive','supplierPay','payExpense');
 if(financial)allowed.push('close','movement','transfer');
 if(has('stock.view'))allowed.push('stock');
 if(allowed.length){const historyGuard=accessGuard(db,identity);const rows=await db.batch([historyGuard.start,db.prepare(`SELECT * FROM audit_log WHERE action IN (${allowed.map(()=>'?').join(',')})`).bind(...allowed),historyGuard.end]);data.audit_log=rows[1].results as HotelData['audit_log'];}
 return {...data,identity:{id:identity.id,name:identity.name,email:identity.email,roles:identity.roles,permissions:identity.permissions}};
}
