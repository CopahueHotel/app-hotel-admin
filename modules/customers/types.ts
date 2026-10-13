import type { customers,customerInquiries,bookingClients } from '@/db/schema';
export type Customer=typeof customers.$inferSelect;
export type Inquiry=typeof customerInquiries.$inferSelect;
export type CustomerSummary=Pick<Customer,'id'|'name'|'email'|'phone'>;
export type CustomersData={customers:(Omit<Customer,'notes'>&{notes?:string})[];inquiries:(Omit<Inquiry,'notes'>&{notes?:string})[];links:(typeof bookingClients.$inferSelect)[];bookings:{id:string;room:number;start:string;end:string;status:string}[];counts:{customer:string;bookings:number;stays:number}[];audit_log:{id:string;created:string;actor:string;action:string;customer?:string;detail?:string}[]};
