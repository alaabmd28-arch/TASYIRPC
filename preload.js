'use strict';
/*
 * جسر آمن بين الواجهة (صفحة HTML) والعملية الرئيسية.
 * لا يُكشف إلا قنوات محددة مسبقًا؛ والصفحة نفسها لا تملك أي صلاحية Node.
 */
const { contextBridge, ipcRenderer } = require('electron');

const SYNC = new Set(['pin:info', 'pin:setup', 'pin:verify', 'pin:disable', 'pin:timeout', 'pin:unlock', 'pin:recover']);
const SEND = new Set(['win:secure', 'win:lang', 'support', 'printers:settings', 'backup:write', 'sync:res']);
const INVOKE = new Set(['file:save', 'printers:list', 'printers:print', 'serial:pick', 'sync:status', 'sync:config']);
const EVENTS = new Set(['serial:list', 'lock:now', 'sync:req']);

const deny = (kind, ch) => { throw new Error(`قناة غير مسموحة (${kind}): ${ch}`); };

contextBridge.exposeInMainWorld('__tasyirNative', {
  sendSync: (ch, ...a) => (SYNC.has(ch) ? ipcRenderer.sendSync(ch, ...a) : deny('sync', ch)),
  send: (ch, ...a) => (SEND.has(ch) ? ipcRenderer.send(ch, ...a) : deny('send', ch)),
  invoke: (ch, ...a) => (INVOKE.has(ch) ? ipcRenderer.invoke(ch, ...a) : deny('invoke', ch)),
  on: (ch, cb) => {
    if (!EVENTS.has(ch)) deny('on', ch);
    ipcRenderer.on(ch, (_e, ...args) => cb(...args));
  },
  platform: process.platform,
});
