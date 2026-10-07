'use client';
import { Departures,GuestMeals } from '@/components/hotel-meals';
import { MenuPlanner,PersonnelLoader,SupplierAgenda } from '@/components/hotel-planning';
import { EconomicDetail,RateFields,RatesPanel,RateTable,ReservationFields } from '@/components/hotel-reservations';
import { Purchases } from '@/components/hotel-supply';
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle } from '@/components/ui/sheet';
import { Sidebar,SidebarContent,SidebarFooter,SidebarHeader,SidebarInset,SidebarMenu,SidebarMenuButton,SidebarMenuItem,SidebarProvider,SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { Tabs,TabsContent,TabsList,TabsTrigger } from '@/components/ui/tabs';
import { departureText,hotelDate,kitchenRows,kitchenTotals,type Service } from '@/lib/hotel-meals';
import type { Booking,Expense,HotelData,Product } from '@/lib/hotel-types';
import { bookingBalance,currency,filterBookings,filterCash,filterProducts,serializeCsv } from '@/lib/hotel-view';
import { AccessProvider,Allowed,ActionButton as Button } from '@/modules/access/context';
import { can,navigationPermissions,operationPermissions,type PublicIdentity } from '@/modules/access/permissions';
import { UsersScreen } from '@/modules/access/screen';
import { CloseFields,MovementFields,PaymentFields,TransferFields } from '@/modules/cash/entry-fields';
import { CashScreen } from '@/modules/cash/screen';
import { DashboardScreen } from '@/modules/dashboard/screen';
import { MealFields } from '@/modules/meals/entry-fields';
import { ExpenseFields,PayExpenseFields,PurchaseFields } from '@/modules/purchases/entry-fields';
import { ReportsScreen } from '@/modules/reports/screen';
import { BarterFields } from '@/modules/reservations/entry-fields';
import { ReservationsScreen } from '@/modules/reservations/screen';
import { SaleFields } from '@/modules/restaurant/forms';
import { RestaurantScreen } from '@/modules/restaurant/screen';
import { BlockFields,RoomFields,UnblockFields } from '@/modules/rooms/entry-fields';
import { CalendarScreen } from '@/modules/rooms/screen';
import { SettingsFields } from '@/modules/settings/entry-fields';
import { SettingsScreen } from '@/modules/settings/screen';
import { DataTable,Field,fmt,shift,Status,sum,type EntryForm } from '@/modules/shared/hotel-ui';
import { ProductFields,StockFields } from '@/modules/stock/entry-fields';
import { StockScreen } from '@/modules/stock/screen';
import { BarChart3,BedDouble,CalendarDays,Check,Hotel,LayoutDashboard,Loader2,Package,Plus,Receipt,RefreshCw,Settings,Users,UtensilsCrossed,Wallet } from 'lucide-react';
import { useCallback,useEffect,useRef,useState,type CSSProperties,type FormEvent } from 'react';
import { toast } from 'sonner';

type ModelContext={registerTool:(tool:{name:string;title:string;description:string;inputSchema:unknown;annotations:{readOnlyHint:boolean};execute:(input:{section:string})=>unknown},options:{signal:AbortSignal})=>unknown};
const nav=[['Inicio',LayoutDashboard],['Calendario',CalendarDays],['Reservas',BedDouble],['Restaurante',UtensilsCrossed],['Caja',Wallet],['Compras y gastos',Receipt],['Stock',Package],['Agenda de proveedores',CalendarDays],['Menú mensual',UtensilsCrossed],['Personal',Users],['Informes',BarChart3],['Configuración',Settings],['Tarifas',Receipt],['Usuarios y permisos',Users]] as const;
const localDate=hotelDate;

export default function Page(){
 const [planningPurchase,setPlanningPurchase]=useState('');
 const [data,setData]=useState<(HotelData & {identity:PublicIdentity})|null>(null),[ratesOpen,setRatesOpen]=useState(false),[page,setPage]=useState('Inicio'),[area,setArea]=useState('Todo'),[date,setDate]=useState(localDate),[calendar,setCalendar]=useState(()=>localDate().slice(0,8)+'01'),[form,setForm]=useState<EntryForm|null>(null),[detail,setDetail]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState(''),[stockCategory,setStockCategory]=useState('Todos'),[reportFrom,setReportFrom]=useState(()=>localDate().slice(0,8)+'01'),[reportTo,setReportTo]=useState(()=>shift(localDate(),30));
 const identitySignature=useRef('');
 const load=useCallback(()=>fetch('/api/hotel').then(async r=>{
  if(r.status===401){window.location.replace('/login');return null;}
  const d=await r.json() as HotelData & {identity:PublicIdentity;error?:string};
  if(!r.ok)throw Error(d.error||'No se pudieron cargar los registros.');
  return d;
 }).then(d=>{setData(d);if(d)setPage(current=>can(d.identity,navigationPermissions[current])?current:nav.find(n=>can(d.identity,navigationPermissions[n[0]]))?.[0]??'Sin acceso');const next=JSON.stringify(d?.identity);if(identitySignature.current!==next){setDetail(null);setForm(null);identitySignature.current=next;}setError('')}).catch((e:unknown)=>setError(e instanceof Error?e.message:'No se pudieron cargar los registros.')).finally(()=>setLoading(false)),[]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{const context=(document as Document & {modelContext?:ModelContext}).modelContext;if(!context?.registerTool)return;const ctl=new AbortController();Promise.resolve(context.registerTool({name:'navigate_hotel_section',title:'Abrir sección del hotel',description:'Abre una sección de administración; no modifica registros.',inputSchema:{type:'object',properties:{section:{type:'string',enum:nav.filter(n=>can(data?.identity,navigationPermissions[n[0]])).map(n=>n[0])}},required:['section'],additionalProperties:false},annotations:{readOnlyHint:true},execute:(input:{section:string})=>{if(!nav.some(n=>n[0]===input?.section&&can(data?.identity,navigationPermissions[n[0]])))throw Error('Sección inválida');setPage(input.section);return {section:input.section}}},{signal:ctl.signal})).catch(()=>{});return()=>ctl.abort()},[data?.identity]);
 useEffect(()=>{
  if(!data?.identity)return;
  const ctl=new AbortController(),signature=JSON.stringify(data.identity);
  const refresh=()=>fetch('/api/auth/me',{signal:ctl.signal}).then(async r=>{
   if(r.status===401){setData(null);window.location.replace('/login');return;}
   if(!r.ok)return;
   const next=await r.json();if(JSON.stringify(next)!==signature)void load();
  }).catch(()=>{});
  const interval=window.setInterval(refresh,30000);window.addEventListener('focus',refresh);
  return()=>{ctl.abort();window.clearInterval(interval);window.removeEventListener('focus',refresh);};
 },[data?.identity,load]);
 const reload=()=>{setLoading(true);void load()};
 const pendingOperations=useRef(new Map<string,string>());
 async function save(action:string,data:unknown){
  const body=JSON.stringify({action,data});
  const key=pendingOperations.current.get(body)??crypto.randomUUID();
  pendingOperations.current.set(body,key);
  const r=await fetch('/api/hotel',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body});
  const result=await r.json() as {error?:string};
  if(r.status===401){setData(null);window.location.replace('/login');}
  if(!r.ok)throw Error(result.error||'No se pudo guardar.');
  pendingOperations.current.delete(body);
 }
 async function signOut(){
  setBusy(true);
  try{
   const response=await fetch('/api/auth/logout',{method:'POST'});
   if(!response.ok)throw Error('No se pudo cerrar la sesi\u00f3n. Intent\u00e1 nuevamente.');
   setData(null);window.location.replace('/login');
  }catch(cause){toast.error(cause instanceof Error?cause.message:'No se pudo cerrar la sesi\u00f3n.');setBusy(false);}
 }
 const open=(action:string,initial:Omit<EntryForm,'action'>={})=>{try{if(!data||operationPermissions(action==='cancel'?'status':action,{...initial,...(action==='rate'?{id:initial.rate?.id}:{}),...(action==='cancel'?{status:'Cancelada'}:{})}).some(p=>!can(data.identity,p)))return toast.error('No tenes permiso para esa accion.');}catch{return;}setForm({action,...initial});};
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const values:Record<string,FormDataEntryValue|boolean>=Object.fromEntries(new FormData(e.currentTarget));for(const k of ['paid','charge'])if(k in values)values[k]=values[k]==='true';setBusy(true);try{if(!form)return;await save(form.action,values);setForm(null);await load();toast.success('Registro guardado')}catch(e:unknown){toast.error(e instanceof Error?e.message:'No se pudo guardar.')}finally{setBusy(false)}}
 async function act(action:string,d:unknown){setBusy(true);try{await save(action,d);await load();toast.success('Cambio guardado')}catch(e:unknown){toast.error(e instanceof Error?e.message:'No se pudo guardar.')}finally{setBusy(false)}}
 if(!data)return <main className="load-screen"><Hotel size={40}/><h1>Hotel · Administración</h1>{loading?<p><Loader2 className="spin"/> Cargando registros…</p>:<><p role="alert">{error}</p><Button onClick={reload}>Reintentar</Button></>}</main>;
 const identity=data.identity;
 const rooms=data.rooms,bookings=data.bookings,sales=data.sales,cash=data.cash_movements,expenses=data.expenses,products=data.products,ledger=data.stock_movements;
 const blockFor=(room:number,day:string)=>data.room_blocks.find(b=>b.active&&b.room===room&&b.start<=day&&day<b.end);
 const termsFor=(id:string)=>data.booking_terms.find(t=>t.booking===id);
 const active=bookings.filter((b)=>b.status!=='Cancelada'),stay=(b:Booking)=>b.start<=date&&date<b.end&&b.status!=='Cancelada'&&b.status!=='Finalizada',staying=active.filter(stay);
 const balance=(b:Booking)=>bookingBalance(b,sales,cash);
 const owed=(e:Expense)=>e.amount+sum(cash.filter((m)=>m.ref===e.id&&m.kind==='Pago'),m=>m.amount);
 const stock=(p:Product)=>sum(ledger.filter((m)=>m.product===p.id),m=>m.qty);
 const accounts=['Efectivo','Banco','Billetera'],accountOpts=accounts.map(a=>[a,a]),areas=['Hotel','Restaurante','Compartido'].map(a=>[a,a]);
 const low=products.filter((p)=>stock(p)<p.minimum),available=rooms.length-rooms.filter((r)=>r.state==='Fuera de servicio'||blockFor(r.id,date)||staying.some((b)=>b.room===r.id)).length;
 const filteredCash=filterCash(cash,{date,area});
 const filteredBookings=filterBookings(bookings,search),filteredProducts=filterProducts(products,stockCategory);
 const selected=bookings.find((b)=>b.id===detail),choiceBookings=active.filter((b)=>!['Finalizada'].includes(b.status)).map((b)=>[b.id,`${b.guest} · Hab. ${b.room}`]);
 const guestRows=(list:Booking[])=>list.map(b=>[<button key="cell-0" className="text-link" onClick={()=>setDetail(b.id)}>{b.guest}<small>{termsFor(b.id)?.benefit??'Habitual'} · {termsFor(b.id)?.payment_condition??'Sin condición registrada'}{termsFor(b.id)?.benefit==='Canje'?' · Canje '+termsFor(b.id)?.barter_status:''}</small><small>Habitación {b.room} · {b.pax} personas · {departureText(b,date)}</small></button>,`${fmt(b.start)} — ${fmt(b.end)}`,b.regime,<Status key="cell-1" value={b.status}/>,<span key="cell-2" className={balance(b)>0?'pending':''}>{(can(identity,'reservations.balance')?currency(balance(b)):'Sin acceso a importes')}</span>]);
 const diners=(meal:string)=>kitchenTotals(kitchenRows(data,date,meal as Service)).hotel;
 const saveMeals=async(action:string,values:unknown)=>{await save(action,values);await load();};
 const mealPrice=Number(data.settings.find((s)=>s.key==='mealPrice')?.value||0);
 const titles:Record<string,string>={Tarifas:'Tarifas de alojamiento','Usuarios y permisos':'Usuarios y permisos',Inicio:'Resumen del día',Calendario:'Calendario de habitaciones',Reservas:'Reservas y huéspedes',Restaurante:'Restaurante',Caja:'Caja y cuentas','Compras y gastos':'Compras y gastos',Stock:'Inventario',Informes:'Informes de gestión',Configuración:'Configuración','Agenda de proveedores':'Agenda de proveedores','Menú mensual':'Menú mensual',Personal:'Personal'};
 const subtitles:Record<string,string>={Tarifas:'Valores vigentes por habitacion y noche.','Usuarios y permisos':'Cuentas individuales y matriz de permisos.',Inicio:'Hotel y restaurante, en una misma vista.',Calendario:'Disponibilidad y estadías de las 17 habitaciones.',Reservas:'Cada estadía, sus consumos y su saldo.',Restaurante:'Comidas del día, bebidas y cargos a habitación.',Caja:'Movimientos compartidos y cierre diario.','Compras y gastos':'Proveedores, vencimientos y pagos pendientes.',Stock:'Existencias, reposición y movimientos por producto.',Informes:'Consultá los registros que explican cada número.',Configuración:'Datos de prueba y parámetros del establecimiento.','Agenda de proveedores':'Frecuencias, pedidos y entregas particulares.','Menú mensual':'Platos previstos y servidos, vinculados a comensales.',Personal:'Planificación, asistencia y novedades del equipo.'};
 const exportCsv=()=>{
  const exportModule=navigationPermissions[page]?.split('.')[0];if(!exportModule||!can(identity,exportModule+'.export'))return;

  const movements=page==='Caja'?filteredCash:filterCash(cash,{from:reportFrom,to:reportTo});
  const rows:(string|number)[][]=page==='Stock'?[['Producto','Categoría','Stock','Unidad','Mínimo'],...filteredProducts.map(p=>[p.name,p.category,stock(p),p.unit,p.minimum])]:page==='Reservas'?[['Huésped','Habitación','Llegada','Salida','Régimen','Estado','Saldo ARS'],...filteredBookings.map(b=>[b.guest,b.room,b.start,b.end,b.regime,b.status,can(identity,'reservations.balance')?balance(b)/100:'Sin acceso a importes'])]:[['Fecha','Cuenta','Actividad','Concepto','Importe ARS'],...movements.map(m=>[m.date,m.account,m.area,m.label,m.amount/100])];
  const csv=serializeCsv(rows),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='hotel-'+page.toLowerCase()+'-'+(page==='Informes'?reportFrom+'-'+reportTo:date)+'.csv';a.click();URL.revokeObjectURL(url);
 };

 return <AccessProvider identity={identity}><SidebarProvider style={{'--sidebar-width':'244px'} as CSSProperties}><Sidebar className="hotel-sidebar"><SidebarHeader><div className="brand"><span className="brand-icon"><Hotel size={23}/></span><div>HOTEL<small>Administración</small></div></div></SidebarHeader><SidebarContent><div className="nav-caption">GESTIÓN DEL ESTABLECIMIENTO</div><SidebarMenu>{nav.filter(n=>can(identity,navigationPermissions[n[0]])).map(([label,Icon])=><SidebarMenuItem key={label}><SidebarMenuButton isActive={page===label} onClick={()=>{setPage(label);setSearch('');setPlanningPurchase('')}} className="nav-button"><Icon/><span>{label}</span>{label==='Stock'&&low.length>0&&<span className="nav-count">{low.length}</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter><div className="side-note"><span className="avatar">P</span><div>{identity.name}<small>{identity.email}</small></div></div></SidebarFooter></Sidebar><SidebarInset className="app-main"><header className="topbar"><div className="topbar-left"><SidebarTrigger/><span>Administración</span><span className="crumb">/ {page}</span></div><div className="topbar-right"><span className="demo-badge">VERSIÓN DE PRUEBA</span><button className="icon-btn" title="Actualizar registros" onClick={reload}><RefreshCw size={17} className={loading?'spin':''}/></button><Button variant="outline" size="sm" disabled={busy} onClick={signOut}>Salir</Button><span className="avatar small">P</span></div></header><main className="workspace"><div className="page-heading"><div><div className="eyebrow">HOTEL + RESTAURANTE</div><h1>{titles[page]}</h1><p>{subtitles[page]}</p></div><div className="heading-actions"><label className="date-control"><CalendarDays size={16}/><input aria-label="Fecha de consulta" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>{['Calendario','Reservas'].includes(page)&&<Button variant="outline" onClick={()=>setRatesOpen(true)}>Consultar tarifas</Button>}{['Inicio','Calendario','Reservas'].includes(page)&&<Button onClick={()=>open('booking')} permission="reservations.create"><Plus size={16}/> Nueva reserva</Button>}{page==='Restaurante'&&can(identity,'restaurant.view')&&<Button onClick={()=>open('sale')} permission="restaurant.create"><Plus size={16}/> Registrar consumo</Button>}{page==='Stock'&&can(identity,'stock.view')&&<Button onClick={()=>setPage('Compras y gastos')}><Plus size={16}/> Registrar compra</Button>}{page==='Caja'&&can(identity,'cash.view')&&<Button onClick={()=>open('close')} permission="cash.close"><Check size={16}/> Cerrar día</Button>}</div></div>{error&&<div className="notice error" role="alert">{error} <button onClick={reload}>Reintentar</button></div>}
 {page==='Inicio'&&can(identity,'panel.view')&&<DashboardScreen area={area} setArea={setArea} date={date} cash={cash} accounts={accounts} staying={staying} rooms={rooms} available={available} setPage={setPage} active={active} balance={balance} expenses={expenses} owed={owed} stay={stay} guestRows={guestRows} diners={diners} low={low} stock={stock} open={open}/>}
 {page==='Inicio'&&can(identity,'panel.view')&&<Departures data={data} date={date} onSelect={setDetail}/>}
 {page==='Calendario'&&can(identity,'rooms.view')&&<CalendarScreen data={data} open={open} setCalendar={setCalendar} calendar={calendar} date={date} rooms={rooms} blockFor={blockFor} active={active} setDetail={setDetail}/>}
 {page==='Reservas'&&can(identity,'reservations.view')&&<ReservationsScreen bookings={bookings} search={search} setSearch={setSearch} exportCsv={exportCsv} guestRows={guestRows} filteredBookings={filteredBookings}/>}
 {page==='Restaurante'&&can(identity,'restaurant.view')&&<RestaurantScreen data={data} date={date} saveMeals={saveMeals} sales={sales}/>}
 {page==='Caja'&&can(identity,'cash.view')&&<CashScreen accounts={accounts} cash={cash} date={date} open={open} exportCsv={exportCsv} area={area} setArea={setArea} filteredCash={filteredCash} data={data}/>}
 {page==='Agenda de proveedores'&&can(identity,'suppliers.view')&&<SupplierAgenda data={data} date={date} onSave={saveMeals} onPurchase={id=>{setPlanningPurchase(id);setPage('Compras y gastos');}}/>}
 {page==='Menú mensual'&&can(identity,'menu.view')&&<MenuPlanner data={data} date={date} onSave={saveMeals}/>}
 {page==='Personal'&&can(identity,'personnel.view')&&<PersonnelLoader date={date} onSave={save}/>}
 {page==='Compras y gastos'&&can(identity,'purchases.view')&&<Purchases key={planningPurchase} data={data} date={date} onSave={saveMeals} initialExpense={planningPurchase}/>}
 {page==='Stock'&&can(identity,'stock.view')&&<StockScreen stockCategory={stockCategory} setStockCategory={setStockCategory} low={low} open={open} exportCsv={exportCsv} filteredProducts={filteredProducts} stock={stock} ledger={ledger} products={products}/>}
 {page==='Informes'&&can(identity,'reports.view')&&<ReportsScreen reportFrom={reportFrom} setReportFrom={setReportFrom} reportTo={reportTo} setReportTo={setReportTo} exportCsv={exportCsv} cash={cash} expenses={expenses} data={data}/>}
 {page==='Configuración'&&can(identity,'settings.view')&&<SettingsScreen data={data} date={date} open={open} mealPrice={mealPrice} rooms={rooms}/>}
 {page==='Tarifas'&&can(identity,'tariffs.view')&&<Allowed permission="tariffs.view"><RatesPanel data={data} date={date} onOpen={rate=>open('rate',{rate})}/></Allowed>}
 {page==='Usuarios y permisos'&&can(identity,'users.view')&&<UsersScreen onSave={saveMeals}/>}
 {page==='Sin acceso'&&<div className="notice">Tu cuenta no tiene modulos de consulta habilitados. Solicita acceso al superadministrador.</div>}
 <footer className="workspace-footer"><span>Hotel · Administración</span><span>Datos ficticios para revisar el funcionamiento</span></footer></main></SidebarInset>
 <Sheet open={!!selected} onOpenChange={v=>!v&&setDetail(null)}><SheetContent className="booking-sheet"><SheetHeader><SheetTitle>{selected?.guest}</SheetTitle><SheetDescription>Habitación {selected?.room} · {selected?.regime} · {selected?.pax} personas</SheetDescription></SheetHeader>{selected&&<div className="sheet-body"><div className="reservation-dates"><div>Llegada<strong>{fmt(selected.start)}</strong></div><div>Salida<strong>{fmt(selected.end)}</strong></div><Status value={selected.status}/></div><p className="departure-notice">{departureText(selected,date)} · consulta {date} (hora del hotel)</p><Allowed permission="meals.view"><GuestMeals booking={selected} data={data} date={date} onSave={saveMeals}/></Allowed><Allowed permission="reservations.balance"><EconomicDetail booking={selected} terms={termsFor(selected.id)} data={data} onBarter={()=>open('barter',{booking:selected.id,version:termsFor(selected.id)?.version??0})}/></Allowed><Allowed permission="reservations.balance"><div className="balance-card"><span>Saldo pendiente</span><strong>{currency(balance(selected))}</strong><small>Alojamiento {currency(selected.amount)} + cargos a estadía − cobros</small></div></Allowed><div className="inline-controls"><Button disabled={busy||['Cancelada','Finalizada'].includes(selected.status)} onClick={()=>open('payment',{booking:selected.id,amount:balance(selected)/100})} permission="reservations.collect">Registrar cobro</Button><Button variant="outline" disabled={['Cancelada','Finalizada'].includes(selected.status)} onClick={()=>open('sale',{booking:selected.id,charge:true})} permission="restaurant.create">Agregar consumo</Button></div><Tabs defaultValue="Datos"><TabsList>{['Datos','Consumos','Pagos'].map(t=><TabsTrigger value={t} key={t}>{t}</TabsTrigger>)}</TabsList><TabsContent value="Datos"><dl className="detail-list"><dt>Origen</dt><dd>{selected.source}</dd><dt>Contacto</dt><dd>{selected.phone||'Sin registrar'}</dd><dt>Noches</dt><dd>{Math.round((Date.parse(selected.end)-Date.parse(selected.start))/86400000)}</dd><dt>Media pensión</dt><dd>{selected.regime==='MP'?selected.meal:'No corresponde'}</dd><dt>Observaciones</dt><dd>{selected.note||'Sin observaciones'}</dd></dl>{!['Finalizada','Cancelada'].includes(selected.status)&&<div className="status-actions"><Button variant="outline" disabled={busy} onClick={()=>open('bookingEdit',{bookingRecord:selected,terms:termsFor(selected.id)})} permission="reservations.edit">Editar reserva y condiciones</Button><Button variant="outline" disabled={busy} onClick={()=>act('status',{id:selected.id,status:selected.status==='Alojado'?'Finalizada':'Alojado'})} permission="reservations.edit">{selected.status==='Alojado'?'Finalizar estadía':'Registrar llegada'}</Button><Button variant="outline" disabled={busy} onClick={()=>open('cancel',{id:selected.id})} permission="reservations.cancel">Cancelar reserva</Button></div>}</TabsContent><Allowed permission="reservations.balance"><TabsContent value="Consumos"><DataTable heads={['Fecha','Detalle','Importe','Tratamiento']} rows={sales.filter((s)=>s.booking===selected.id).map((s)=>[fmt(s.date),s.label,currency(s.amount),s.amount===0?s.kind:s.account?'Pagado en '+s.account:'Cargo a estadía'])}/></TabsContent></Allowed><Allowed permission="reservations.balance"><TabsContent value="Pagos"><DataTable heads={['Fecha','Cuenta','Importe']} rows={cash.filter((m)=>m.ref===selected.id&&m.kind==='Cobro').map((m)=>[fmt(m.date),m.account,currency(m.amount)])}/></TabsContent></Allowed></Tabs></div>}</SheetContent></Sheet>
 <Dialog open={ratesOpen} onOpenChange={setRatesOpen}><DialogContent><DialogHeader><DialogTitle>Tarifas por habitación y noche</DialogTitle><DialogDescription>Consulta por fecha, sin abandonar la carga de reservas.</DialogDescription></DialogHeader><Input aria-label="Fecha para consultar tarifas" type="date" value={date} onChange={e=>setDate(e.target.value)}/><RateTable rates={data.room_rates} date={date}/></DialogContent></Dialog>
 <Dialog open={!!form} onOpenChange={v=>!v&&!busy&&setForm(null)}><DialogContent className="entry-dialog"><DialogHeader><DialogTitle>{({bookingEdit:'Editar reserva y condiciones',rate:'Tarifa por habitación y noche',block:'Bloquear noches por mantenimiento',unblock:'Liberar bloqueo de mantenimiento',barter:'Cumplimiento de canje',booking:'Nueva reserva',sale:'Registrar consumo',payment:'Cobro de estadía',expense:'Registrar gasto',payExpense:'Pago a proveedor',purchase:'Compra e ingreso a stock',stock:'Movimiento de stock',product:'Nuevo producto',room:'Estado de habitación',close:'Cierre diario de caja',settings:'Precio de comida externa',transfer:'Transferencia entre cuentas',movement:'Aporte / retiro de socios',meal:'Elección de media pensión',cancel:'Cancelar reserva'} as Record<string,string>)[form?.action??'']}</DialogTitle><DialogDescription>{form?.action==='booking'?'La habitación quedará reservada desde la llegada hasta el día anterior a la salida.':form?.action==='close'?'El cierre conserva los importes del día y bloquea nuevas cargas en esa fecha.':'Los cambios se guardan en la base de datos de prueba.'}</DialogDescription></DialogHeader>{form&&form.action==='cancel'?<div><p>Solo se pueden cancelar aquí reservas sin cobros ni consumos. La habitación se liberará.</p><div className="form-actions"><Button variant="outline" onClick={()=>setForm(null)}>Volver</Button><Button disabled={busy} onClick={async()=>{await act('status',{id:form.id,status:'Cancelada'});setForm(null)}}>Confirmar cancelación</Button></div></div>:form&&<form onSubmit={submit} className="entry-form"><div className="form-grid">
 {['booking','bookingEdit'].includes(form.action)&&<ReservationFields data={data} date={date} initial={form} booking={form.bookingRecord} terms={form.terms}/>}
 {form.action==='rate'&&<RateFields rate={form.rate} date={date}/>}
 {form.action==='block'&&<BlockFields rooms={rooms} date={date}/>}
 {form.action==='unblock'&&<UnblockFields form={form}/>}
 {form.action==='barter'&&<BarterFields form={form} termsFor={termsFor}/>}
 {['sale','payment','expense','payExpense','stock','purchase','close','transfer','movement'].includes(form.action)&&<Field label="Fecha" name="date" type="date" value={date} readOnly={form.action==='close'}/> }
 {form.action==='sale'&&<SaleFields form={form} choiceBookings={choiceBookings} products={products} mealPrice={mealPrice} accountOpts={accountOpts}/>}
 {form.action==='payment'&&<PaymentFields form={form} choiceBookings={choiceBookings} accountOpts={accountOpts}/>}
 {form.action==='expense'&&<ExpenseFields date={date} areas={areas} accountOpts={accountOpts}/>}
 {form.action==='payExpense'&&<PayExpenseFields form={form} accountOpts={accountOpts}/>}
 {form.action==='purchase'&&<PurchaseFields products={products} date={date} accountOpts={accountOpts}/>}
 {form.action==='stock'&&<StockFields form={form} products={products}/>}
 {form.action==='product'&&<ProductFields />}
 {form.action==='room'&&<RoomFields form={form}/>}
 {form.action==='close'&&<CloseFields date={date} cash={cash}/>}
 {form.action==='settings'&&<SettingsFields form={form}/>}
 {form.action==='transfer'&&<TransferFields accountOpts={accountOpts}/>}
 {form.action==='movement'&&<MovementFields accountOpts={accountOpts}/>}
 {form.action==='meal'&&<MealFields form={form} date={date}/>}
 </div><div className="form-actions"><Button type="button" variant="outline" onClick={()=>setForm(null)} disabled={busy}>Volver</Button><Button type="submit" disabled={busy}>{busy?<Loader2 size={16} className="spin"/>:<Check size={16}/>} {busy?'Guardando…':'Guardar'}</Button></div></form>}</DialogContent></Dialog><Toaster richColors position="top-right"/></SidebarProvider></AccessProvider>
}
