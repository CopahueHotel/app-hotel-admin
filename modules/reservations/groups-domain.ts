import { initialPaymentSchema } from '@/modules/cash/initial-payment';
import { exactMoney } from '@/modules/shared/validation';
import { z } from 'zod';
import { bookingSchema } from '@/modules/reservations/domain';
import { customerDetails } from '@/modules/customers/domain';
import type { HotelData } from '@/lib/hotel-types';

const text=z.string().trim().min(1).max(240);
const contact={customerId:z.string().default(''),customer:customerDetails.optional(),guest:z.string().max(240).default(''),phone:z.string().max(240).default('')};
const fields={name:text,pax:z.coerce.number().int().min(1).max(1000),note:z.string().trim().max(1000).default('')};
export const groupRoomSchema=bookingSchema.omit({deposit:true,guest:true,phone:true,customer:true,customerId:true,inquiryId:true,inquiryVersion:true}).refine(row=>row.priceMode!=='Conservar','Una reserva nueva necesita tarifas o precio acordado.');
export const groupCreateSchema=z.object({...fields,...contact,deposit:initialPaymentSchema.optional(),pricing:z.object({mode:z.enum(['Persona/noche','Total']),value:exactMoney,reason:text}).optional(),rooms:z.array(groupRoomSchema).min(1).max(100)});
export const groupSaveSchema=z.object({...fields,...contact,id:z.string().default(''),version:z.coerce.number().int().nonnegative().default(0),bookings:z.array(text).max(100).default([])});
export const groupMembersSchema=z.object({id:text,version:z.coerce.number().int().nonnegative(),bookings:z.array(text).min(1).max(100),active:z.boolean(),reason:text});
export function groupForBooking(data:Pick<HotelData,'reservation_groups'|'group_bookings'>,booking:string){
 const link=data.group_bookings?.find(item=>item.booking===booking&&item.active===1);
 return link?data.reservation_groups?.find(group=>group.id===link.group_id):undefined;
}
