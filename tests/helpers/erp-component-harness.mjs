import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';
import { transform } from 'next/dist/build/swc/index.js';
import { compareWorkItems } from '../../lib/execution-engine.js';
import { REALM_TASK_TRANSITIONS } from '../../lib/realm-action-contract.js';
const require = createRequire(import.meta.url);

export async function mountMyWorkHarness(page) {
  const input = await readFile(new URL('../../app/(app)/myday/page.jsx', import.meta.url), 'utf8');
  const nodes = parse(input, { sourceType: 'module', plugins: ['jsx'] }).program.body;
  const app = nodes.filter(node => node.type !== 'ImportDeclaration').map(node => input.slice(node.start, node.end).replace(/^export default /, '')).join('\n');
  const presentation = (await readFile(new URL('../../lib/task-presentation.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const source = `
    const {useState,useEffect,useMemo,useCallback,useRef} = React;
    const useSession = () => ({data:{user:{id:'staff',name:'Người kiểm thử'}}});
    window.messages = []; const useToast = () => text => window.messages.push(text);
    const styles = new Proxy({}, {get:(_,key)=>String(key)});
    function Icon(){return null;}
    function Link({children,...props}) { return <a {...props}>{children}</a>; }
    function PageHeader({title,description,actions}) {return <header><h1>{title}</h1><p>{description}</p>{actions}</header>;}
    function StatePanel({title,description,action}) {return <section role="status"><h2>{title}</h2><p>{description}</p>{action}</section>;}
    const compareWorkItems = ${compareWorkItems.toString()};
    const transitions = ${JSON.stringify(REALM_TASK_TRANSITIONS)};
    const realmTaskTransitions = status => transitions[status] || [];
    ${presentation}
    ${app}
    ReactDOM.createRoot(document.getElementById('root')).render(<MyDayPage/>);
  `;
  const compiled = await transform(source, { filename: 'my-work-harness.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } }, target: 'es2020' }, module: { type: 'es6' } });
  await page.route('http://localhost:3419/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' }));
  await page.goto('http://localhost:3419/');
  await page.addScriptTag({ path: require.resolve('react/package.json').replace('package.json', 'umd/react.development.js') });
  await page.addScriptTag({ path: require.resolve('react-dom/package.json').replace('package.json', 'umd/react-dom.development.js') });
  await page.addScriptTag({ content: compiled.code });
}

/** Test actual hook/FormModal source in React DOM with a minimal dialog shell.
 * This does not exercise authentication, Radix focus management or API authorization. */
export async function mountResourceHarness(page) {
  const ui = await readFile(new URL('../../components/ui.jsx', import.meta.url), 'utf8');
  const ast = parse(ui, { sourceType: 'module', plugins: ['jsx'] });
  const wanted = ['useResource', 'FormModal', 'ResourceError'];
  const functions = ast.program.body.filter(node => node.type === 'ExportNamedDeclaration' && wanted.includes(node.declaration?.id?.name))
    .map(node => ui.slice(node.declaration.start, node.declaration.end)).join('\n');
  const client = (await readFile(new URL('../../lib/resource-client.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
  const lead = await readFile(new URL('../../app/(app)/leads/page.jsx', import.meta.url), 'utf8');
  let createHandler;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXAttribute' && node.name?.name === 'onSave' && node.value?.expression) {
      const expression = lead.slice(node.value.expression.start, node.value.expression.end);
      if (expression.includes('await create(')) createHandler = expression;
    }
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
  }
  visit(parse(lead, { sourceType: 'module', plugins: ['jsx'] }));
  if (!createHandler) throw new Error('Missing actual Lead create handler');
  const source = `
    const { useState, useRef, useId, useEffect, useCallback, useContext } = React;
    const SessionContext = React.createContext(undefined);
    window.messages = []; window.inflight = 0;
    const useToast = () => (message, type) => window.messages.push({message, type});
    const bumpInflight = value => { window.inflight += value; };
    function Modal({title, children, footer, onClose}) { return <section role="dialog" aria-label={title}><h2>{title}</h2>{children}{footer}<button onClick={onClose}>Đóng</button></section>; }
    ${client}
    ${functions}
    function App() {
      const [filter, setFilter] = useState('one'); const [enabled, setEnabled] = useState(true);
      const [open, setOpen] = useState(false);
      const resource = useResource('leads', { ownerId: filter }, {enabled});
      window.api = resource; window.setFilter = setFilter; window.setEnabled = setEnabled;
      const {create} = resource; const toast = useToast(); const loadWorkload = async () => {}; const todayISO = () => '2026-09-12';
      const save = ${createHandler};
      return <main><button onClick={() => setOpen(true)}>Thêm Lead</button><output data-testid="rows">{JSON.stringify(resource.rows)}</output><output data-testid="loading">{String(resource.loading)}</output><ResourceError error={resource.error} onRetry={resource.refresh} loading={resource.loading}/>{open && <FormModal title="Thêm Lead" fields={[{key:'name',label:'Người liên hệ',required:true}]} onSave={save} onClose={() => setOpen(false)}/>}</main>;
    }
    function SessionFixture() {
      const [user, setUser] = useState({id:'first-user', roles:['AM']}); window.setUser = setUser;
      return <SessionContext.Provider value={{status:'authenticated',data:{user}}}><App/></SessionContext.Provider>;
    }
    window.root = ReactDOM.createRoot(document.getElementById('root'));
    window.root.render(<React.StrictMode><SessionFixture/></React.StrictMode>);
  `;
  const compiled = await transform(source, { filename: 'erp-harness.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } }, target: 'es2020' }, module: { type: 'es6' } });
  await page.route('http://erp-ui.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' }));
  await page.goto('http://erp-ui.test/');
  await page.addScriptTag({ path: require.resolve('react/package.json').replace('package.json', 'umd/react.development.js') });
  await page.addScriptTag({ path: require.resolve('react-dom/package.json').replace('package.json', 'umd/react-dom.development.js') });
  await page.addScriptTag({ content: compiled.code });
}
