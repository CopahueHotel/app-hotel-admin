import { z } from 'zod';
import { exactMoney } from '@/modules/shared/validation';
import { reservationNights } from '@/modules/shared/nights';
import type { HotelData } from '@/lib/hotel-types';
export const extraBedSchema=z.object({mode:z.enum(['Noche','Total']),value:exactMoney,reason:z.string().trim().min(1).max(1000)});
export const roomCapacity=(type:string|undefined,extraBed=false)=>type==='Single'?1:extraBed?3:2;
export function extraBedPrice(bed:z.infer<typeof extraBedSchema>,start:string,end:string){
 const value=Math.round(bed.value*100),nights=reservationNights(start,end).length,total=bed.mode==='Noche'?value*nights:value;
 if(!Number.isSafeInteger(total)||total<0||total>10000000000||!nights||nights>365)throw Error('Revisá el importe y las fechas de la cama extra.');
 return {value,total,nights};
}
export const bedForBooking=(data:Pick<HotelData,'booking_extra_beds'>,id:string)=>data.booking_extra_beds?.find(b=>b.booking===id);
