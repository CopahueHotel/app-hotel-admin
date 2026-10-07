// Monetary amounts are integer cents. Balances are always derived, never edited.
export const remainingAmount=(base:number,charges:number,paid:number)=>base+charges-paid;
