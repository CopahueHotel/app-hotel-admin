import { database } from '@/lib/hotel-db';
import { sessionIdentity,accessGuard } from '@/lib/hotel-auth';
import { can } from '@/modules/access/permissions';
import { hotelDate } from '@/lib/hotel-meals';
import { monthDates,shiftDate } from '@/modules/shared/dates';
import { serializeCsv } from '@/lib/hotel-view';
import { hotelStatistics,type StatisticsInput,type HotelStatistics } from '@/modules/reports/statistics';

function csvRows(data:HotelStatistics){
 const rows:(string|number)[][]=[['Estadísticas hotel',data.month,data.scope==='realized'?'Realizada hasta ayer':'Previsión desde hoy'],['Fecha de consulta del hotel',data.today],['Indicador','Valor'],
  ['Habitaciones actuales',data.rooms],['Días analizados',data.days],['Noches habitación totales',data.capacity],['Noches bloqueadas vigentes',data.blocked],['Noches disponibles',data.available],['Noches ocupadas',data.occupied],['Ocupación sobre disponibles %',data.occupancy??'Sin base'],['Ocupación sobre totales %',data.grossOccupancy??'Sin base'],['Reservas por habitación',data.reservations],['Personas en reservas (no únicas)',data.people],['Personas-noches',data.personNights],['Estadía media completa en noches',data.averageStay??'Sin datos'],[],['Fecha','En período','Ocupadas','Disponibles','Bloqueadas','Ocupación %','Confirmadas pasadas sin revisar']];
 for(const d of data.daily)rows.push([d.date,d.inScope?'Sí':'No',d.occupied,d.available,d.blocked,d.occupancy??'',d.unreviewed]);
 rows.push([],['Día de semana','Días analizados','Noches ocupadas','Noches disponibles','Ocupación %']);
 for(const d of data.weekdays)rows.push([d.label,d.days,d.nights,d.available,d.occupancy??'']);
 for(const [title,distribution] of [['Canales',data.channels],['Regímenes',data.regimes],['Grupos e individuales',data.segments],['País del contacto',data.countries],['Provincia del contacto',data.provinces],['Localidad del contacto',data.localities]] as const){
  rows.push([],[title,'Reservas por habitación','Noches','% de noches']);for(const row of distribution)rows.push([row.label,row.reservations,row.nights,row.share]);
 }
 rows.push([],['Criterio','Inventario actual; bloqueos vigentes, estado global de mantenimiento solo desde hoy. Procedencia del contacto actual, no de todos los huéspedes. Sin información no se deduce. No incluye importes ni cobros.']);
 return rows;
}
export async function GET(request:Request){
 const identity=await sessionIdentity(request);if(identity instanceof Response)return identity;
 const query=new URL(request.url).searchParams,exporting=query.has('export');
 if(!can(identity,'reports.view')||exporting&&!can(identity,'reports.export'))return Response.json({error:'No tenés permiso para consultar o exportar estos informes.'},{status:403,headers:{'Cache-Control':'no-store'}});
 const month=query.get('month')??hotelDate().slice(0,7),scope=query.get('scope')??'realized';
 if(!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)||!['realized','forecast'].includes(scope))return Response.json({error:'Elegí un mes válido y el tipo de ocupación.'},{status:400,headers:{'Cache-Control':'no-store'}});
 try{
  const dates=monthDates(month+'-01'),start=dates[0],end=shiftDate(dates.at(-1)!,1),db=database(),guard=accessGuard(db,identity);
  const result=await db.batch([guard.start,
   db.prepare('SELECT id,state FROM rooms'),
   db.prepare(`SELECT b.id,b.start,b.end,b.pax,b.status,b.regime,b.source,g.group_id,c.locality,c.province,c.country FROM bookings b LEFT JOIN booking_clients l ON l.booking=b.id LEFT JOIN customers c ON c.id=l.customer LEFT JOIN group_bookings g ON g.booking=b.id AND g.active=1 WHERE b.start<? AND b.end>? AND b.status<>'Cancelada'`).bind(end,start),
   db.prepare('SELECT room,date,booking FROM room_nights WHERE date>=? AND date<?').bind(start,end),
   db.prepare('SELECT room,start,end FROM room_blocks WHERE active=1 AND start<? AND end>?').bind(end,start),guard.end]);
  const input={rooms:result[1].results,bookings:result[2].results,nights:result[3].results,blocks:result[4].results} as StatisticsInput;
  const data=hotelStatistics(input,month,scope as 'realized'|'forecast',hotelDate());
  if(exporting)return new Response(serializeCsv(csvRows(data)),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="estadisticas-${month}-${scope}.csv"`,'Cache-Control':'no-store'}});
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error(error);return Response.json({error:'No se pudieron cargar las estadísticas. Actualizá e intentá nuevamente.'},{status:error instanceof Error&&error.message.includes('HOT_ACCESS_CHANGED')?403:503,headers:{'Cache-Control':'no-store'}});}
}
