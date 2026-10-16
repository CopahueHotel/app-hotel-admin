import type { Booking,HotelData } from '@/lib/hotel-types';
export type RoomSegment={room:number;start:string;end:string};
type Plans=Pick<HotelData,'booking_room_plans'>;
export function roomSegments(data:Plans,booking:Booking):RoomSegment[]{
 const plan=data.booking_room_plans?.find(plan=>plan.booking===booking.id);
 return plan?JSON.parse(plan.segments) as RoomSegment[]:[{room:booking.room,start:booking.start,end:booking.end}];
}
export function roomAtDate(data:Plans,booking:Booking,date:string){
 const segments=roomSegments(data,booking);
 return (segments.find(segment=>segment.start<=date&&date<segment.end)??(date<booking.start?segments[0]:segments.at(-1)))?.room??booking.room;
}
export function roomLabels(data:Plans,booking:Booking){return roomSegments(data,booking).map(segment=>segment.room).join(' → ');}
export function roomUnavailable(data:Pick<HotelData,'bookings'|'room_blocks'|'rooms'|'booking_room_plans'>,room:number,start:string,end:string,exclude?:string){
 return data.rooms.some(r=>r.id===room&&r.state==='Fuera de servicio')||data.bookings.some(b=>b.id!==exclude&&b.status!=='Cancelada'&&roomSegments(data,b).some(segment=>segment.room===room&&segment.start<end&&segment.end>start))||data.room_blocks.some(block=>block.active&&block.room===room&&block.start<end&&block.end>start);
}
