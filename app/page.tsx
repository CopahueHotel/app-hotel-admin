'use client';
import { Departures } from '@/components/hotel-meals';
import { MenuPlanner,PersonnelLoader,SupplierAgenda } from '@/components/hotel-planning';
import { RateFields,RatesPanel,RateTable,ReservationFields } from '@/components/hotel-reservations';
import { Purchases } from '@/components/hotel-supply';
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Sidebar,SidebarContent,SidebarFooter,SidebarHeader,SidebarInset,SidebarMenu,SidebarMenuButton,SidebarMenuItem,SidebarProvider,SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { departureText,hotelDate,kitchenRows,kitchenTotals,type Service } from '@/lib/hotel-meals';
import type { Booking,Expense,HotelData,Product } from '@/lib/hotel-types';
import { bookingBalance,currency,filterBookings,filterCash,filterProducts,serializeCsv } from '@/lib/hotel-view';
import { AccessProvider,Allowed,ActionButton as Button } from '@/modules/access/context';
import { can,navigationPermissions,operationPermissions,type PublicIdentity } from '@/modules/access/permissions';
import { CustomersLoader } from '@/modules/customers/screen';
import { UsersScreen } from '@/modules/access/screen';
import { CloseFields,MovementFields,PaymentFields,TransferFields } from '@/modules/cash/entry-fields';
import { CashScreen } from '@/modules/cash/screen';
import { DashboardScreen } from '@/modules/dashboard/screen';
import { MealFields } from '@/modules/meals/entry-fields';
import { ExpenseFields,PayExpenseFields,PurchaseFields } from '@/modules/purchases/entry-fields';
import { ReportsScreen } from '@/modules/reports/screen';
import { BarterFields } from '@/modules/reservations/entry-fields';
import { ReservationsScreen } from '@/modules/reservations/screen';
import { ReservationSheet } from '@/modules/reservations/detail';
import { RoomMoveDialog } from '@/modules/reservations/room-move-form';
import { roomAtDate,roomLabels } from '@/modules/reservations/room-plan';
import { ReservationGroups } from '@/modules/reservations/groups-screen';
import { groupForBooking } from '@/modules/reservations/groups-domain';
import { SaleFields } from '@/modules/restaurant/forms';
import { RestaurantScreen } from '@/modules/restaurant/screen';
import { BlockFields,RoomFields,UnblockFields } from '@/modules/rooms/entry-fields';
import { CalendarScreen } from '@/modules/rooms/screen';
import { SettingsFields } from '@/modules/settings/entry-fields';
import { SettingsScreen } from '@/modules/settings/screen';
import { Field,fmt,shift,Status,sum,type EntryForm } from '@/modules/shared/hotel-ui';
import { ProductFields,StockFields } from '@/modules/stock/entry-fields';
import { StockScreen } from '@/modules/stock/screen';
import { BarChart3,BedDouble,CalendarDays,Check,Hotel,LayoutDashboard,Loader2,Package,Plus,Receipt,RefreshCw,Settings,Users,UtensilsCrossed,Wallet } from 'lucide-react';
import { useCallback,useEffect,useRef,useState,type CSSProperties,type FormEvent } from 'react';
import { toast } from 'sonner';

type ModelContext={registerTool:(tool:{name:string;title:string;description:string;inputSchema:unknown;annotations:{readOnlyHint:boolean};execute:(input:{section:string})=>unknown},options:{signal:AbortSignal})=>unknown};
const nav=[['Inicio',LayoutDashboard],['Calendario',CalendarDays],['Reservas',BedDouble],['Clientes',Users],['Restaurante',UtensilsCrossed],['Caja',Wallet],['Compras y gastos',Receipt],['Stock',Package],['Agenda de proveedores',CalendarDays],['Menú mensual',UtensilsCrossed],['Personal',Users],['Informes',BarChart3],['Configuración',Settings],['Tarifas',Receipt],['Usuarios y permisos',Users]] as const;
const localDate=hotelDate;

export default function Page(){
 const [moving,setMoving]=useState<{booking:string;room?:number}|null>(null);
 const [planningPurchase,setPlanningPurchase]=useState('');
 const [data,setData]=useState<(HotelData & {identity:PublicIdentity})|null>(null),[ratesOpen,setRatesOpen]=useState(false),[page,setPage]=useState('Inicio'),[area,setArea]=useState('Todo'),[date,setDate]=useState(localDate),[calendar,setCalendar]=useState(()=>localDate().slice(0,8)+'01'),[form,setForm]=useState<EntryForm|null>(null),[detail,setDetail]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState(''),[stockCategory,setStockCategory]=useState('Todos'),[reportFrom,setReportFrom]=useState(()=>localDate().slice(0,8)+'01'),[reportTo,setReportTo]=useState(()=>shift(localDate(),30));
 const identitySignature=useRef('');
 const load=useCallback(()=>fetch('/api/hotel').then(async r=>{
  if(r.status===401){window.location.replace('/login');return null;}
  const d=await r.json() as HotelData & {identity:PublicIdentity;error?:string};
  if(!r.ok)throw Error(d.error||'No se pudieron cargar los registros.');
  return d;
 }).then(d=>{setData(d);if(d)setPage(current=>can(d.identity,navigationPermissions[current])?current:nav.find(n=>can(d.identity,navigationPermissions[n[0]]))?.[0]??'Sin acceso');const next=JSON.stringify(d?.identity);if(identitySignature.current!==next){setDetail(null);setForm(null);setMoving(null);identitySignature.current=next;}setError('')}).catch((e:unknown)=>setError(e instanceof Error?e.message:'No se pudieron cargar los registros.')).finally(()=>setLoading(false)),[]);
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
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const values:Record<string,unknown>=Object.fromEntries(new FormData(e.currentTarget));if((form?.action==='booking'||form?.action==='bookingEdit')&&!values.customerId){values.customer={name:values.guest,phone:values.phone,email:values.customerEmail??'',locality:values.customerLocality??'',province:values.customerProvince??'',country:values.customerCountry??'',origin:values.customerOrigin??'Otro',duplicateConfirmed:values.customerDuplicate==='on'};}for(const k of ['paid','charge'])if(k in values)values[k]=values[k]==='true';setBusy(true);try{if(!form)return;await save(form.action,values);setForm(null);await load();toast.success('Registro guardado')}catch(e:unknown){toast.error(e instanceof Error?e.message:'No se pudo guardar.')}finally{setBusy(false)}}
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
 const low=products.filter((p)=>stock(p)<p.minimum),available=rooms.length-rooms.filter((r)=>r.state==='Fuera de servicio'||blockFor(r.id,date)||staying.some((b)=>roomAtDate(data,b,date)===r.id)).length;
 const filteredCash=filterCash(cash,{date,area});
 const filteredBookings=bookings.filter(b=>filterBookings([b],search).length>0||roomLabels(data,b).includes(search.trim())||groupForBooking(data,b.id)?.name.toLowerCase().includes(search.toLowerCase())),filteredProducts=filterProducts(products,stockCategory);
 const movingBooking=bookings.find(b=>b.id===moving?.booking);
 const selected=bookings.find((b)=>b.id===detail),choiceBookings=active.filter((b)=>!['Finalizada'].includes(b.status)).map((b)=>[b.id,`${b.guest} · Hab. ${roomAtDate(data,b,date)}`]);
 const guestRows=(list:Booking[])=>list.map(b=>[<button key="cell-0" className="text-link" onClick={()=>setDetail(b.id)}>{b.guest}{groupForBooking(data,b.id)&&<small className="reservation-group-tag">Grupo: {groupForBooking(data,b.id)!.name}</small>}<small>{termsFor(b.id)?.benefit??'Habitual'} · {termsFor(b.id)?.payment_condition??'Sin condición registrada'}{termsFor(b.id)?.benefit==='Canje'?' · Canje '+termsFor(b.id)?.barter_status:''}</small><small>Habitaciones {roomLabels(data,b)} · {b.pax} personas · {departureText(b,date)}</small></button>,`${fmt(b.start)} — ${fmt(b.end)}`,b.regime,<Status key="cell-1" value={b.status}/>,<span key="cell-2" className={balance(b)>0?'pending':''}>{(can(identity,'reservations.balance')?currency(balance(b)):'Sin acceso a importes')}</span>]);
 const diners=(meal:string)=>kitchenTotals(kitchenRows(data,date,meal as Service)).hotel;
 const saveMeals=async(action:string,values:unknown)=>{await save(action,values);await load();};
 const mealPrice=Number(data.settings.find((s)=>s.key==='mealPrice')?.value||0);
 const titles:Record<string,string>={Clientes:'Clientes y consultas',Tarifas:'Tarifas de alojamiento','Usuarios y permisos':'Usuarios y permisos',Inicio:'Resumen del día',Calendario:'Calendario de habitaciones',Reservas:'Reservas y huéspedes',Restaurante:'Restaurante',Caja:'Caja y cuentas','Compras y gastos':'Compras y gastos',Stock:'Inventario',Informes:'Informes de gestión',Configuración:'Configuración','Agenda de proveedores':'Agenda de proveedores','Menú mensual':'Menú mensual',Personal:'Personal'};
 const subtitles:Record<string,string>={Clientes:'Contactos, estadías y seguimiento manual.',Tarifas:'Valores vigentes por habitacion y noche.','Usuarios y permisos':'Cuentas individuales y matriz de permisos.',Inicio:'Hotel y restaurante, en una misma vista.',Calendario:'Disponibilidad y estadías de las 17 habitaciones.',Reservas:'Cada estadía, sus consumos y su saldo.',Restaurante:'Comidas del día, bebidas y cargos a habitación.',Caja:'Movimientos compartidos y cierre diario.','Compras y gastos':'Proveedores, vencimientos y pagos pendientes.',Stock:'Existencias, reposición y movimientos por producto.',Informes:'Consultá los registros que explican cada número.',Configuración:'Parámetros del establecimiento.','Agenda de proveedores':'Frecuencias, pedidos y entregas particulares.','Menú mensual':'Platos previstos y servidos, vinculados a comensales.',Personal:'Planificación, asistencia y novedades del equipo.'};
 const exportCsv=()=>{
  const exportModule=navigationPermissions[page]?.split('.')[0];if(!exportModule||!can(identity,exportModule+'.export'))return;

  const movements=page==='Caja'?filteredCash:filterCash(cash,{from:reportFrom,to:reportTo});
  const rows:(string|number)[][]=page==='Stock'?[['Producto','Categoría','Stock','Unidad','Mínimo'],...filteredProducts.map(p=>[p.name,p.category,stock(p),p.unit,p.minimum])]:page==='Reservas'?[['Grupo','Huésped','Habitación','Llegada','Salida','Régimen','Estado','Saldo ARS'],...filteredBookings.map(b=>[groupForBooking(data,b.id)?.name??'',b.guest,roomLabels(data,b),b.start,b.end,b.regime,b.status,can(identity,'reservations.balance')?balance(b)/100:'Sin acceso a importes'])]:[['Fecha','Cuenta','Actividad','Concepto','Importe ARS'],...movements.map(m=>[m.date,m.account,m.area,m.label,m.amount/100])];
  const csv=serializeCsv(rows),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='hotel-'+page.toLowerCase()+'-'+(page==='Informes'?reportFrom+'-'+reportTo:date)+'.csv';a.click();URL.revokeObjectURL(url);
 };

 return <AccessProvider identity={identity}><SidebarProvider style={{'--sidebar-width':'244px'} as CSSProperties}><Sidebar className="hotel-sidebar"><SidebarHeader><div className="brand"><span className="brand-icon"><Hotel size={23}/></span><div>HOTEL<small>Administración</small></div></div></SidebarHeader><SidebarContent><div className="nav-caption">GESTIÓN DEL ESTABLECIMIENTO</div><SidebarMenu>{nav.filter(n=>can(identity,navigationPermissions[n[0]])).map(([label,Icon])=><SidebarMenuItem key={label}><SidebarMenuButton isActive={page===label} onClick={()=>{setPage(label);setSearch('');setPlanningPurchase('')}} className="nav-button"><Icon/><span>{label}</span>{label==='Stock'&&low.length>0&&<span className="nav-count">{low.length}</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter><div className="side-note"><span className="avatar">P</span><div>{identity.name}<small>{identity.email}</small></div></div></SidebarFooter></Sidebar><SidebarInset className="app-main"><header className="topbar"><div className="topbar-left"><SidebarTrigger/><span>Administración</span><span className="crumb">/ {page}</span></div><div className="topbar-right"><button className="icon-btn" title="Actualizar registros" onClick={reload}><RefreshCw size={17} className={loading?'spin':''}/></button><Button variant="outline" size="sm" disabled={busy} onClick={signOut}>Salir</Button><span className="avatar small">P</span></div></header><main className="workspace"><div className="page-heading"><div><div className="eyebrow">HOTEL + RESTAURANTE</div><h1>{titles[page]}</h1><p>{subtitles[page]}</p></div><div className="heading-actions"><Button type="button" variant="outline" onClick={()=>setDate(hotelDate())} aria-label="Volver al día actual">Hoy</Button><label className="date-control"><CalendarDays size={16}/><input aria-label="Fecha de consulta" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>{['Calendario','Reservas'].includes(page)&&<Button variant="outline" onClick={()=>setRatesOpen(true)}>Consultar tarifas</Button>}{['Inicio','Calendario','Reservas'].includes(page)&&<Button onClick={()=>open('booking')} permission="reservations.create"><Plus size={16}/> Nueva reserva</Button>}{page==='Restaurante'&&can(identity,'restaurant.view')&&<Button onClick={()=>open('sale')} permission="restaurant.create"><Plus size={16}/> Registrar consumo</Button>}{page==='Stock'&&can(identity,'stock.view')&&<Button onClick={()=>setPage('Compras y gastos')}><Plus size={16}/> Registrar compra</Button>}{page==='Caja'&&can(identity,'cash.view')&&<Button onClick={()=>open('close')} permission="cash.close"><Check size={16}/> Cerrar día</Button>}</div></div>{error&&<div className="notice error" role="alert">{error} <button onClick={reload}>Reintentar</button></div>}
 {page==='Inicio'&&can(identity,'panel.view')&&<DashboardScreen area={area} setArea={setArea} date={date} cash={cash} accounts={accounts} staying={staying.map(b=>({...b,room:roomAtDate(data,b,date)}))} rooms={rooms} available={available} setPage={setPage} active={active} balance={balance} expenses={expenses} owed={owed} stay={stay} guestRows={guestRows} diners={diners} low={low} stock={stock} open={open}/>}
 {page==='Inicio'&&can(identity,'panel.view')&&<Departures data={data} date={date} onSelect={setDetail}/>}
 {page==='Calendario'&&can(identity,'rooms.view')&&<CalendarScreen data={data} open={open} setCalendar={setCalendar} calendar={calendar} date={date} rooms={rooms} blockFor={blockFor} active={active} setDetail={setDetail} onMove={(booking,room)=>{setDetail(null);setMoving({booking,room});}}/>}
 {page==='Reservas'&&can(identity,'reservations.view')&&<><ReservationGroups key={JSON.stringify(identity.permissions)} data={data} date={date} onSave={saveMeals} onBooking={setDetail}/><ReservationsScreen bookings={bookings} search={search} setSearch={setSearch} exportCsv={exportCsv} guestRows={guestRows} filteredBookings={filteredBookings}/></>}
 {page==='Restaurante'&&can(identity,'restaurant.view')&&<RestaurantScreen data={data} date={date} saveMeals={saveMeals} sales={sales}/>}
 {page==='Caja'&&can(identity,'cash.view')&&<CashScreen accounts={accounts} cash={cash} date={date} open={open} exportCsv={exportCsv} area={area} setArea={setArea} filteredCash={filteredCash} data={data}/>}
 {page==='Agenda de proveedores'&&can(identity,'suppliers.view')&&<SupplierAgenda data={data} date={date} onSave={saveMeals} onPurchase={id=>{setPlanningPurchase(id);setPage('Compras y gastos');}}/>}
 {page==='Menú mensual'&&can(identity,'menu.view')&&<MenuPlanner data={data} date={date} onSave={saveMeals}/>}
 {page==='Personal'&&can(identity,'personnel.view')&&<PersonnelLoader date={date} onSave={save}/>}
 {page==='Compras y gastos'&&can(identity,'purchases.view')&&<Purchases key={planningPurchase} data={data} date={date} onSave={saveMeals} initialExpense={planningPurchase}/>}
 {page==='Stock'&&can(identity,'stock.view')&&<StockScreen stockCategory={stockCategory} setStockCategory={setStockCategory} low={low} open={open} exportCsv={exportCsv} filteredProducts={filteredProducts} stock={stock} ledger={ledger} products={products}/>}
 {page==='Informes'&&can(identity,'reports.view')&&<ReportsScreen reportFrom={reportFrom} setReportFrom={setReportFrom} reportTo={reportTo} setReportTo={setReportTo} exportCsv={exportCsv} cash={cash} expenses={expenses} data={data}/>}
 {page==='Clientes'&&can(identity,'customers.view')&&<CustomersLoader key={JSON.stringify(identity.permissions)} date={date} onSave={save} onChange={load} onBook={initial=>open('booking',initial)} onBooking={id=>setDetail(id)}/>}
 {page==='Configuración'&&can(identity,'settings.view')&&<SettingsScreen open={open} mealPrice={mealPrice} rooms={rooms}/>}
 {page==='Tarifas'&&can(identity,'tariffs.view')&&<Allowed permission="tariffs.view"><RatesPanel data={data} date={date} onOpen={rate=>open('rate',{rate})}/></Allowed>}
 {page==='Usuarios y permisos'&&can(identity,'users.view')&&<UsersScreen onSave={saveMeals}/>}
 {page==='Sin acceso'&&<div className="notice">Tu cuenta no tiene modulos de consulta habilitados. Solicita acceso al superadministrador.</div>}
 <footer className="workspace-footer"><span>Hotel · Administración</span></footer></main></SidebarInset>
 {movingBooking&&can(identity,'reservations.edit')&&<RoomMoveDialog key={movingBooking.id+':'+(moving?.room??'')} booking={movingBooking} data={data} target={moving?.room} onSave={saveMeals} onClose={()=>setMoving(null)}/>}
 <ReservationSheet booking={selected} terms={selected?termsFor(selected.id):undefined} data={data} date={date} busy={busy} onClose={()=>setDetail(null)} onSaveMeals={saveMeals} onMove={()=>{if(selected){setDetail(null);setMoving({booking:selected.id});}}}
  onEdit={()=>{if(selected)open('bookingEdit',{bookingRecord:selected,terms:termsFor(selected.id)});}}
  onStatus={()=>{if(selected)void act('status',{id:selected.id,status:selected.status==='Alojado'?'Finalizada':'Alojado'});}}
  onCancel={()=>{if(selected)open('cancel',{id:selected.id});}}
  onPayment={()=>{if(selected)open('payment',{booking:selected.id,amount:balance(selected)/100});}}
  onSale={()=>{if(selected)open('sale',{booking:selected.id,charge:true});}}
  onBarter={()=>{if(selected)open('barter',{booking:selected.id,version:termsFor(selected.id)?.version??0});}}/>
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
