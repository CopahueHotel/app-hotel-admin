export const modules = {
 panel: ['view'], reservations: ['view','create','edit','cancel','export','balance','price','discount','special','charge','collect'],
 rooms: ['view','edit','create','cancel','export'], tariffs: ['view','create','edit','export'],
 restaurant: ['view','create','edit','cancel','special','export','prices','price','collect','charge'],
 meals: ['view','create','edit','export'], menu: ['view','create','edit','export'],
 stock: ['view','create','edit','export','waste','adjust','configure'],
 purchases: ['view','create','receive','export','financial','pay'], suppliers: ['view','create','edit','cancel','export'],
 cash: ['view','create','close','export'], personnel: ['view','create','edit','cancel','export','reports','special'],
 reports: ['view','export'], settings: ['view','configure'], users: ['view','configure'],
} as const;
export type Module = keyof typeof modules;
export const permissionCatalog = Object.entries(modules).flatMap(([module,actions])=>actions.map(action=>`${module}.${action}`));
export const moduleLabels: Record<Module,string> = {panel:'Panel diario',reservations:'Reservas y huéspedes',rooms:'Habitaciones y calendario',tariffs:'Tarifas',restaurant:'Restaurante y bebidas',meals:'Alimentación y asistencia',menu:'Menú',stock:'Stock',purchases:'Compras y vencimientos',suppliers:'Proveedores y entregas',cash:'Caja',personnel:'Personal',reports:'Informes financieros',settings:'Configuración',users:'Usuarios y permisos'};
export const actionLabels: Record<string,string> = {view:'Consultar',create:'Crear',edit:'Modificar',cancel:'Anular / regularizar',export:'Exportar',configure:'Configurar',balance:'Consultar saldo por estadía',price:'Modificar precio acordado',discount:'Aplicar descuentos',special:'Acuerdos especiales',charge:'Cargar a estadía',collect:'Registrar cobros',prices:'Consultar importes de consumos',receive:'Recibir mercadería',financial:'Consultar importes y pagos de compras',pay:'Registrar pagos',waste:'Registrar mermas',adjust:'Ajustar por conteo',close:'Confirmar cierre',reports:'Consultar novedades internas'};
export const roleNames = {superadmin:'Superadministrador',administration:'Administración',manager:'Gerente',reception:'Recepción',restaurant:'Restaurante',supply:'Stock / Abastecimiento',kitchen:'Cocina',partner:'Socio / Consulta'} as const;
const group=(module:Module,actions:readonly string[])=>actions.map(a=>`${module}.${a}`);
const all=(module:Module)=>group(module,modules[module]);
export const initialPermissions: Record<keyof typeof roleNames,string[]> = {
 superadmin: permissionCatalog,
 administration: [...all('cash'),...all('purchases'),...all('suppliers'),...all('reports'),'panel.view','reservations.view','reservations.balance','reservations.collect','restaurant.view','restaurant.prices','restaurant.edit','restaurant.collect'],
 manager: permissionCatalog.filter(p=>!p.startsWith('users.')&&!p.startsWith('settings.')&&!['cash.create','cash.pay','cash.collect'].includes(p)),
 reception: [...group('reservations',['view','create','edit','cancel','export','balance']),...all('meals'),...group('rooms',['view','edit']),'tariffs.view','restaurant.view','restaurant.prices','panel.view'],
 restaurant: [...group('restaurant',['view','create','edit','export','prices']),...all('meals'),'menu.view','panel.view'],
 supply: [...all('stock'),...group('purchases',['view','receive','export']),...all('suppliers'),'panel.view'],
 kitchen: [...all('menu'),...all('meals'),'restaurant.view','stock.view','panel.view'],
 partner: ['panel.view','reservations.view','reservations.balance','rooms.view','tariffs.view','restaurant.view','restaurant.prices','menu.view','meals.view','stock.view','purchases.view','purchases.financial','suppliers.view','cash.view','reports.view'],
};
export type Identity = {id:string;name:string;email:string;roles:string[];permissions:string[];revision:number;sessionHash:string};
export type PublicIdentity = Omit<Identity,'sessionHash'|'revision'>;
export const can=(identity:Pick<Identity,'permissions'>|null|undefined,permission:string)=>!!identity?.permissions.includes(permission);
export function operationPermissions(action:string,d:Record<string,unknown>):string[] {
 const mapping:Record<string,string[]>={booking:['reservations.create'],bookingEdit:['reservations.edit'],rate:[`tariffs.${d.id?'edit':'create'}`],block:['rooms.create'],unblock:['rooms.cancel'],barter:['reservations.special'],status:[d.status==='Cancelada'?'reservations.cancel':'reservations.edit'],room:['rooms.edit'],payment:['reservations.collect'],sale:['restaurant.create'],meal:['meals.edit'],guestProfile:['meals.edit'],mealChoice:['meals.edit'],mealSuspend:['meals.edit'],mealReactivate:['meals.edit'],mealServe:['meals.create'],mealPlan:['meals.create'],mealPlanStatus:['meals.edit'],beverageAccount:['restaurant.create'],beverageDispatch:['restaurant.create'],beverageSettle:['restaurant.edit'],beverageReturn:['restaurant.edit'],beverageCorrect:['restaurant.cancel'],purchaseDocument:['purchases.create'],purchaseReceive:['purchases.receive'],supplierPay:['purchases.pay'],expense:['purchases.create'],purchase:['purchases.create','purchases.receive'],payExpense:['purchases.pay'],stock:['stock.edit'],product:['stock.create'],close:['cash.close'],transfer:['cash.create'],movement:['cash.create'],settings:['settings.configure'],supplierProfile:[`suppliers.${d.id?'edit':'create'}`],deliveryGenerate:['suppliers.create'],deliveryEdit:[`suppliers.${d.status==='Cancelada'?'cancel':d.id?'edit':'create'}`],menuPlan:[`menu.${d.id?'edit':'create'}`],menuCopy:['menu.create'],menuActual:['menu.edit'],staffEmployee:[`personnel.${d.id?'edit':'create'}`],staffEvent:[`personnel.${d.status==='Cancelado'?'cancel':d.id?'edit':'create'}`],staffAttendance:['personnel.edit'],staffReport:['personnel.reports',`personnel.${d.id?'edit':'create'}`],userSave:['users.configure'],userReset:['users.configure'],rolePermissions:['users.configure']};
 const required=mapping[action];
 if(!required)throw Error('HOT_FORBIDDEN');
 if(action==='guestProfile')return ['meals.edit'];
 const result=[...required];
 if(['booking','bookingEdit'].includes(action)){
  if(d.priceMode==='Acordado')result.push('reservations.price');
  if(d.priceMode!=='Conservar'&&d.discountType&&d.discountType!=='Ninguno')result.push('reservations.discount');
  if(d.priceMode!=='Conservar'&&d.benefit&&d.benefit!=='Habitual')result.push('reservations.special');
 }
 if(action==='sale'){
  if(d.kind==='Cortesía'||d.kind==='Interno')result.push('restaurant.special');
  else if(d.kind!=='Incluida')result.push(d.charge?'restaurant.charge':'restaurant.collect');
 }
 if(action==='beverageDispatch'){
  if(d.mode==='Inmediato')result.push('restaurant.collect');
  if(d.mode==='Estadía')result.push('restaurant.charge');
  if(d.destination==='Cortesía'||d.destination==='Interno')result.push('restaurant.special');
 }
 if(action==='beverageSettle')result.push(d.method==='Cobro'?'restaurant.collect':'restaurant.charge');
 if(['expense','purchase'].includes(action)&&d.paid)result.push('purchases.pay');
 if(action==='purchaseDocument'&&d.received)result.push('purchases.receive');
 if(action==='menuCopy'&&d.overwrite)result.push('menu.edit');
 if(action==='staffEvent'&&d.acknowledge)result.push('personnel.special');
 if(action==='stock')result.push(d.reason==='Conteo físico'?'stock.adjust':['Merma','Rotura / pérdida'].includes(String(d.reason))?'stock.waste':'stock.edit');
 if(action==='product'&&Number(d.price)>0)result.push('stock.configure');
 return [...new Set(result)];
}
export const navigationPermissions:Record<string,string>={'Inicio':'panel.view','Calendario':'rooms.view','Reservas':'reservations.view','Restaurante':'restaurant.view','Caja':'cash.view','Compras y gastos':'purchases.view','Agenda de proveedores':'suppliers.view','Menú mensual':'menu.view','Personal':'personnel.view','Stock':'stock.view','Informes':'reports.view','Configuración':'settings.view','Tarifas':'tariffs.view','Usuarios y permisos':'users.view'};
