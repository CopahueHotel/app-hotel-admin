export const currentRegimes = ['Sin desayuno', 'Desayuno', 'MP', 'PC'] as const;
export const supportedRegimes = [...currentRegimes] as const;
export function regimeLabel(regime:string) {
  return regime==='MP'?'Media pensión':regime==='PC'?'Pensión completa':regime;
}
export function regimeIncludesService(regime:string,service:string,chosenMeal:string) {
  return (service==='Desayuno'&&['Desayuno','MP','PC'].includes(regime))
    || (['Almuerzo','Cena'].includes(service)&&(regime==='PC'||regime==='MP'&&service===chosenMeal));
}
