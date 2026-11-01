import vm from 'node:vm';
export function loadI18n(html,language='ja') {
 const window={};
 const core=html.match(/\/\/ ==== I18N-CORE-BEGIN ====([\s\S]*?)\/\/ ==== I18N-CORE-END ====/)[1];
 vm.runInNewContext(core,{window,localStorage:{getItem:()=>language,setItem(){}},navigator:{languages:[language]}});
 return window.JohbaI18n;
}
