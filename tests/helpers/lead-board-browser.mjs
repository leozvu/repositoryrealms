import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';
import { transform } from 'next/dist/build/swc/index.js';
import { LEAD_STAGES, money, moneyShort, initials, todayISO, localISO } from '../../lib/format.js';
import { LEAD_SOURCES } from '../../lib/lead-intake.js';
const require = createRequire(import.meta.url);
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const strip = source => source.replace(/^import .*;\r?\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '');

// Execute the actual Lead page, resource client, hook, form and export against
// network fixtures. Layout primitives/CSS/auth are outside this component proof.
export async function mountLeadBoard(page, query = '') {
  const ui = await read('../../components/ui.jsx');
  const nodes = parse(ui, { sourceType: 'module', plugins: ['jsx'] }).program.body;
  const functions = nodes.filter(node => node.type === 'ExportNamedDeclaration' && ['useResource', 'ResourceError', 'FormModal'].includes(node.declaration?.id?.name)).map(node => ui.slice(node.declaration.start, node.declaration.end)).join('\n');
  const source = `
    const {useState,useEffect,useMemo,useRef,useCallback,useContext,useId} = React;
    const SessionContext=React.createContext(undefined);
    const styles=new Proxy({}, {get:(_,key)=>String(key)});
    window.messages=[]; const notify=message=>window.messages.push(message); const useToast=()=>notify;
    const bumpInflight=()=>{}; const useRouter=()=>({push:href=>window.lastRoute=href});
    const useSearchParams=()=>{const [query,setQuery]=useState(window.location.search); window.setSearch=setQuery; return new URLSearchParams(query);};
    function Icon(){return null;} function Forbidden(){return <p>Forbidden</p>;}
    function Modal({title,children,footer,onClose}){return <section role="dialog" aria-label={title}><h2>{title}</h2>{children}{footer}<button onClick={onClose}>Đóng</button></section>;}
    function ConfirmDialog(){return null;} function ActivitiesModal(){return null;}
    function AsyncButton({children,pendingLabel,...props}){return <button {...props}>{children}</button>;}
    function BarChart({series}){return <output aria-label="Forecast">{JSON.stringify(series[0].values)}</output>;}
    const LEAD_STAGES=${JSON.stringify(LEAD_STAGES)}, LEAD_SOURCES=${JSON.stringify(LEAD_SOURCES)};
    const money=${money.toString()}, moneyShort=${moneyShort.toString()}, initials=${initials.toString()}, localISO=${localISO.toString()}, todayISO=${todayISO.toString()};
    ${strip(await read('../../lib/resource-client.js'))}
    ${strip(await read('../../lib/lead-board-client.js'))}
    ${functions}
    ${strip(await read('../../components/crm/LeadExport.jsx'))}
    ${strip(await read('../../app/(app)/leads/page.jsx'))}
    function SessionFixture(){const [user,setUser]=useState({id:'am-a',roles:['AM']}); window.setUser=setUser; return <SessionContext.Provider value={{status:'authenticated',data:{user}}}><LeadsPage/></SessionContext.Provider>;}
    ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><SessionFixture/></React.StrictMode>);
  `;
  const compiled = await transform(source, { filename: 'lead-board-harness.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } }, target: 'es2020' }, module: { type: 'es6' } });
  await page.route('http://erp-ui.test/*', route => new URL(route.request().url()).pathname.startsWith('/api/') ? route.fallback() : route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>' }));
  await page.goto(`http://erp-ui.test/${query}`);
  await page.addScriptTag({ path: require.resolve('react/package.json').replace('package.json', 'umd/react.development.js') });
  await page.addScriptTag({ path: require.resolve('react-dom/package.json').replace('package.json', 'umd/react-dom.development.js') });
  await page.addScriptTag({ content: compiled.code });
}
