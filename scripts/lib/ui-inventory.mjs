import fs from 'node:fs';
import path from 'node:path';
import parserPackage from '@babel/parser';
import { ERP_NAV } from '../../lib/erp-navigation.js';

const { parse } = parserPackage;
const SOURCE_EXTENSION = /\.(?:js|jsx|ts|tsx)$/i;
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const NATIVE_ACTION_TAGS = new Set(['button', 'a', 'form']);
const SEMANTIC_ACTION_COMPONENTS = new Set(['AsyncButton']);
const FORM_CONTROL_TAGS = new Set(['input', 'select', 'textarea']);
const DIRECT_INTERACTION_HANDLERS = [
  'onClick',
  'onSubmit',
  'onPointerDown',
  'onMouseDown',
  'onDoubleClick',
  'onTouchStart',
];

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function parseSource(source, filename) {
  return parse(source, {
    sourceType: 'unambiguous',
    sourceFilename: filename,
    errorRecovery: false,
    plugins: [
      'jsx',
      'typescript',
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'dynamicImport',
      'importMeta',
      'optionalChaining',
      'nullishCoalescingOperator',
      'objectRestSpread',
      'topLevelAwait',
    ],
  });
}

function readSourceFiles(root, directories = ['app', 'components']) {
  const files = [];
  const visit = (absolute) => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const target = path.join(absolute, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && SOURCE_EXTENSION.test(entry.name)) files.push(target);
    }
  };
  for (const directory of directories) {
    const absolute = path.join(root, directory);
    if (fs.existsSync(absolute)) visit(absolute);
  }
  return files.sort((a, b) => normalizePath(a).localeCompare(normalizePath(b)));
}

function walk(node, visitor, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visitor(node, ancestors);
  const nextAncestors = typeof node.type === 'string' ? [...ancestors, node] : ancestors;
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments', 'tokens', 'errors'].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visitor, nextAncestors);
    } else if (value && typeof value === 'object') {
      walk(value, visitor, nextAncestors);
    }
  }
}

function nodeCode(node, source, maxLength = 240) {
  if (!node || !Number.isInteger(node.start) || !Number.isInteger(node.end)) return '';
  const compact = source.slice(node.start, node.end).replace(/\s+/g, ' ').trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
}

function jsxName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') return `${jsxName(node.object)}.${jsxName(node.property)}`;
  if (node.type === 'JSXNamespacedName') return `${jsxName(node.namespace)}:${jsxName(node.name)}`;
  return '';
}

function propertyName(node) {
  if (!node) return '';
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') return String(node.value);
  return '';
}

function staticValue(node, constants = new Map()) {
  if (!node) return undefined;
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
  if (node.type === 'NullLiteral') return null;
  if (node.type === 'Identifier') {
    if (node.name === 'undefined') return undefined;
    return constants.get(node.name);
  }
  if (node.type === 'ArrayExpression') {
    const values = node.elements.map((element) => staticValue(element, constants));
    return values.some((value, index) => value === undefined && node.elements[index]?.type !== 'Identifier')
      ? undefined
      : values;
  }
  if (node.type === 'ObjectExpression') {
    const result = {};
    for (const property of node.properties) {
      if (property.type !== 'ObjectProperty' || property.computed) return undefined;
      const key = propertyName(property.key);
      if (!key) return undefined;
      result[key] = staticValue(property.value, constants);
    }
    return result;
  }
  return undefined;
}

function topLevelConstants(ast) {
  const constants = new Map();
  for (const statement of ast.program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration') continue;
    for (const item of declaration.declarations) {
      if (item.id.type !== 'Identifier' || !item.init) continue;
      const value = staticValue(item.init, constants);
      if (value !== undefined) constants.set(item.id.name, value);
    }
  }
  return constants;
}

function attributeMap(openingElement, source) {
  const attributes = new Map();
  for (const attribute of openingElement.attributes || []) {
    if (attribute.type === 'JSXSpreadAttribute') {
      attributes.set('...', { code: nodeCode(attribute.argument, source), value: undefined });
      continue;
    }
    const name = jsxName(attribute.name);
    if (!attribute.value) {
      attributes.set(name, { code: 'true', value: true });
    } else if (attribute.value.type === 'StringLiteral') {
      attributes.set(name, { code: attribute.value.value, value: attribute.value.value });
    } else if (attribute.value.type === 'JSXExpressionContainer') {
      attributes.set(name, {
        code: nodeCode(attribute.value.expression, source),
        value: staticValue(attribute.value.expression),
      });
    }
  }
  return attributes;
}

function childText(node, source, parts = []) {
  if (!node || parts.join(' ').length > 180) return parts;
  if (node.type === 'JSXText') {
    const text = node.value.replace(/\s+/g, ' ').trim();
    if (text) parts.push(text);
    return parts;
  }
  if (node.type === 'StringLiteral') {
    if (node.value.trim()) parts.push(node.value.trim());
    return parts;
  }
  if (node.type === 'JSXExpressionContainer') {
    const value = staticValue(node.expression);
    if (typeof value === 'string' || typeof value === 'number') parts.push(String(value));
    else if (node.expression.type === 'ConditionalExpression') {
      childText(node.expression.consequent, source, parts);
      childText(node.expression.alternate, source, parts);
    } else if (node.expression.type === 'Identifier') {
      parts.push(`{${node.expression.name}}`);
    }
    return parts;
  }
  if (node.type === 'JSXElement') {
    const tag = jsxName(node.openingElement.name);
    if (tag === 'Icon') return parts;
    for (const child of node.children || []) childText(child, source, parts);
    return parts;
  }
  if (node.type === 'JSXFragment') {
    for (const child of node.children || []) childText(child, source, parts);
  }
  return parts;
}

function normalizeLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function slug(value, fallback = 'unnamed') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return normalized || fallback;
}

function sourceSurface(relativeFile) {
  if (relativeFile.startsWith('app/') && /\/page\.(?:js|jsx|ts|tsx)$/.test(relativeFile)) {
    const route = pageRouteFromFile(relativeFile);
    return `route.${route === '/' ? 'home' : slug(route)}`;
  }
  return `component.${slug(relativeFile.replace(/\.(?:js|jsx|ts|tsx)$/i, ''))}`;
}

function routeSegments(relativeFile, marker) {
  const normalized = normalizePath(relativeFile);
  const prefix = marker === 'page' ? 'app/' : 'app/api/';
  // Root files become `page.jsx` / `route.js` after the prefix is removed,
  // while nested files still contain a slash. Accept both shapes so app/page.jsx
  // is represented by `/` instead of the phantom `/page.jsx` route.
  const suffix = new RegExp(`(?:^|/)${marker}\\.(?:js|jsx|ts|tsx)$`);
  const withoutFile = normalized.replace(prefix, '').replace(suffix, '');
  return withoutFile
    .split('/')
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
    .filter((segment) => !segment.startsWith('@'));
}

export function pageRouteFromFile(relativeFile) {
  const segments = routeSegments(relativeFile, 'page');
  return segments.length ? `/${segments.join('/')}` : '/';
}

export function apiRouteFromFile(relativeFile) {
  const segments = routeSegments(relativeFile, 'route');
  return `/api/${segments.join('/')}`;
}

function collectBindings(ast, source) {
  const resources = new Set();
  const apiCalls = [];
  const routeTargets = new Set();
  walk(ast, (node) => {
    if (node.type !== 'CallExpression') return;
    const calleeName = node.callee.type === 'Identifier'
      ? node.callee.name
      : node.callee.type === 'MemberExpression'
        ? propertyName(node.callee.property)
        : '';
    if (calleeName === 'useResource') {
      const value = staticValue(node.arguments[0]);
      if (typeof value === 'string') resources.add(value);
    }
    if (calleeName === 'fetch') {
      const endpoint = nodeCode(node.arguments[0], source, 180);
      let method = 'GET';
      const options = node.arguments[1];
      if (options?.type === 'ObjectExpression') {
        const methodProperty = options.properties.find(
          (property) => property.type === 'ObjectProperty' && propertyName(property.key) === 'method',
        );
        const methodValue = methodProperty ? staticValue(methodProperty.value) : undefined;
        if (typeof methodValue === 'string') method = methodValue.toUpperCase();
        else if (methodProperty) method = nodeCode(methodProperty.value, source, 40);
      }
      if (endpoint) apiCalls.push({ endpoint, method, line: node.loc?.start.line || 0 });
    }
    const calleeObject = node.callee.type === 'MemberExpression'
      ? nodeCode(node.callee.object, source, 80)
      : '';
    const isRouterNavigation = ['push', 'replace'].includes(calleeName) && /(^|\.)router$/i.test(calleeObject);
    const isLocationNavigation = calleeName === 'assign' && /(^|\.)location$/i.test(calleeObject);
    if (isRouterNavigation || isLocationNavigation) {
      const target = nodeCode(node.arguments[0], source, 180);
      if (target) routeTargets.add(target);
    }
    if (calleeName === 'signOut') {
      const options = node.arguments[0];
      if (options?.type === 'ObjectExpression') {
        const callback = options.properties.find(
          (property) => property.type === 'ObjectProperty' && propertyName(property.key) === 'callbackUrl',
        );
        const target = callback ? nodeCode(callback.value, source, 180) : '';
        if (target) routeTargets.add(target);
      }
    }
  });
  return {
    resources: [...resources].sort(),
    apiCalls: apiCalls.sort((a, b) => a.line - b.line || a.endpoint.localeCompare(b.endpoint)),
    routeTargets: [...routeTargets].sort(),
  };
}

function mergeBindings(...groups) {
  const resources = new Set();
  const apiCalls = new Map();
  const routeTargets = new Set();
  for (const group of groups) {
    for (const resource of group.resources) resources.add(resource);
    for (const call of group.apiCalls) apiCalls.set(`${call.method}:${call.endpoint}`, call);
    for (const target of group.routeTargets) routeTargets.add(target);
  }
  return {
    resources: [...resources].sort(),
    apiCalls: [...apiCalls.values()].sort((a, b) => a.line - b.line || a.endpoint.localeCompare(b.endpoint)),
    routeTargets: [...routeTargets].sort(),
  };
}

function elementKind(tag, attributes) {
  if (tag === 'form') return 'form-submit';
  if (FORM_CONTROL_TAGS.has(tag)) return 'form-control';
  if (tag === 'a' || tag === 'Link' || attributes.has('href')) return 'navigation';
  return 'action';
}

function isInteractive(tag, attributes) {
  if (NATIVE_ACTION_TAGS.has(tag) || SEMANTIC_ACTION_COMPONENTS.has(tag) || FORM_CONTROL_TAGS.has(tag) || tag === 'Link') return true;
  if (DIRECT_INTERACTION_HANDLERS.some((name) => attributes.has(name))) return true;
  if (attributes.get('role')?.value === 'button') return true;
  return false;
}

function nearestForm(ancestors) {
  return ancestors.some(
    (ancestor) => ancestor.type === 'JSXElement' && jsxName(ancestor.openingElement.name) === 'form',
  );
}

function elementRisks({ tag, attributes, label, insideForm, handler, target }) {
  const risks = [];
  const nativeSemantic = NATIVE_ACTION_TAGS.has(tag) || SEMANTIC_ACTION_COMPONENTS.has(tag) || FORM_CONTROL_TAGS.has(tag) || tag === 'Link';
  const hasDirectHandler = DIRECT_INTERACTION_HANDLERS.some((name) => attributes.has(name));
  if (hasDirectHandler && !nativeSemantic && attributes.get('role')?.value !== 'button') {
    risks.push('clickable_non_semantic');
    if (!attributes.has('tabIndex') || !attributes.has('onKeyDown')) risks.push('keyboard_path_unverified');
  }
  if (tag === 'button' && !label && !attributes.has('aria-label') && !attributes.has('title')) {
    risks.push('unlabelled_button_candidate');
  }
  if (tag === 'button' && !handler && !insideForm && attributes.get('type')?.value !== 'submit') {
    risks.push('possible_noop_button');
  }
  if (tag === 'button' && insideForm && !attributes.has('type') && handler) {
    risks.push('implicit_submit_candidate');
  }
  if ((tag === 'a' || tag === 'Link') && !target) risks.push('missing_navigation_target');
  if (tag === 'a' && attributes.get('target')?.value === '_blank' && attributes.get('rel')?.value !== 'noreferrer') {
    risks.push('external_link_rel_unverified');
  }
  if (FORM_CONTROL_TAGS.has(tag) && !attributes.has('name') && !attributes.has('aria-label')) {
    risks.push('control_binding_unverified');
  }
  return risks;
}

function extractElements({ ast, source, relativeFile, bindings, idCounts }) {
  const elements = [];
  const surface = sourceSurface(relativeFile);
  walk(ast, (node, ancestors) => {
    if (node.type !== 'JSXElement') return;
    const tag = jsxName(node.openingElement.name);
    const attributes = attributeMap(node.openingElement, source);
    if (!isInteractive(tag, attributes)) return;
    if (tag === 'input' && attributes.get('type')?.value === 'hidden') return;

    const insideForm = nearestForm(ancestors);
    const handlerName = DIRECT_INTERACTION_HANDLERS.find((name) => attributes.has(name));
    const handler = handlerName ? attributes.get(handlerName)?.code || '' : '';
    const target = attributes.get('href')?.code || attributes.get('action')?.code || '';
    const childLabel = normalizeLabel(childText(node, source).join(' / '));
    const label = normalizeLabel(
      attributes.get('aria-label')?.value
        || childLabel
        || attributes.get('title')?.value
        || attributes.get('placeholder')?.value
        || attributes.get('name')?.value
        || target,
    );
    const kind = elementKind(tag, attributes);
    const signature = label || target || handler || tag;
    const baseId = `${surface}.${kind}.${slug(signature, slug(tag))}`;
    const occurrence = (idCounts.get(baseId) || 0) + 1;
    idCounts.set(baseId, occurrence);
    const id = occurrence === 1 ? baseId : `${baseId}.${occurrence}`;
    const risks = elementRisks({ tag, attributes, label, insideForm, handler, target });
    const actionStatus = target
      ? 'navigation-candidate'
      : handler
        ? 'handler-candidate'
        : tag === 'form' || insideForm || attributes.get('type')?.value === 'submit'
          ? 'form-submit-candidate'
          : FORM_CONTROL_TAGS.has(tag)
            ? 'control-candidate'
            : 'unresolved';

    elements.push({
      elementId: id,
      source: relativeFile,
      line: node.loc?.start.line || 0,
      column: (node.loc?.start.column || 0) + 1,
      surface,
      tag,
      kind,
      label,
      handlerEvent: handlerName || '',
      handler,
      target,
      insideForm,
      disabledBinding: attributes.get('disabled')?.code || attributes.get('aria-busy')?.code || '',
      actionStatus,
      mappingStatus: 'unreviewed',
      businessFeature: '',
      resourceCandidates: bindings.resources,
      apiCandidates: bindings.apiCalls.map((call) => `${call.method} ${call.endpoint}`),
      routeCandidates: bindings.routeTargets,
      uxRiskCandidates: risks,
    });
  });
  return elements;
}

function exportedHttpMethods(ast) {
  const methods = new Set();
  for (const statement of ast.program.body) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = statement.declaration;
    if (declaration?.type === 'FunctionDeclaration' && declaration.id && HTTP_METHODS.has(declaration.id.name)) {
      methods.add(declaration.id.name);
    }
    if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations) {
        if (item.id.type === 'Identifier' && HTTP_METHODS.has(item.id.name)) methods.add(item.id.name);
      }
    }
    for (const specifier of statement.specifiers || []) {
      const exported = propertyName(specifier.exported);
      if (HTTP_METHODS.has(exported)) methods.add(exported);
    }
  }
  const order = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  return order.filter((method) => methods.has(method));
}

function extractNavigation(root) {
  const nav = ERP_NAV;
  if (!Array.isArray(nav)) return [];
  const items = [];
  let section = '';
  for (const item of nav) {
    if (!item || typeof item !== 'object') continue;
    if (item.section) {
      section = String(item.section);
      continue;
    }
    if (!item.key) continue;
    const configuredRoles = Array.isArray(item.roles) ? item.roles : [];
    items.push({
      route: `/${item.key}`,
      key: item.key,
      label: item.label || item.key,
      section,
      roles: [...new Set(['DIRECTOR', ...configuredRoles])],
      module: item.mod || '',
    });
  }
  return items;
}

function routeNavigation(route, navigation) {
  const exact = navigation.find((item) => item.route === route);
  if (exact) return exact;
  return navigation.find((item) => route.startsWith(`${item.route}/[`)) || null;
}

function routeAuth(route, relativeFile) {
  if (relativeFile.startsWith('app/(app)/')) return 'authenticated';
  if (route === '/login' || route === '/realm-demo' || route === '/') return 'public';
  return 'unverified';
}

function summarize(inventory) {
  const byKind = {};
  const risks = {};
  const bySource = {};
  for (const element of inventory.elements) {
    byKind[element.kind] = (byKind[element.kind] || 0) + 1;
    bySource[element.source] = (bySource[element.source] || 0) + 1;
    for (const risk of element.uxRiskCandidates) risks[risk] = (risks[risk] || 0) + 1;
  }
  return {
    uiRoutes: inventory.uiRoutes.length,
    apiRoutes: inventory.apiRoutes.length,
    interactiveElements: inventory.elements.length,
    sourceFilesWithInteractions: Object.keys(bySource).length,
    routesInPrimaryNavigation: inventory.uiRoutes.filter((route) => route.inNavigation).length,
    routesWithResourceCandidates: inventory.uiRoutes.filter((route) => route.resourceCandidates.length).length,
    byKind: Object.fromEntries(Object.entries(byKind).sort(([a], [b]) => a.localeCompare(b))),
    uxRiskCandidates: Object.fromEntries(Object.entries(risks).sort(([a], [b]) => a.localeCompare(b))),
    topInteractiveSources: Object.entries(bySource)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 15)
      .map(([source, count]) => ({ source, count })),
  };
}

export function buildUiInventory(root) {
  const absoluteRoot = path.resolve(root);
  const files = readSourceFiles(absoluteRoot);
  const navigation = extractNavigation(absoluteRoot);
  const idCounts = new Map();
  const elements = [];
  const uiRoutes = [];
  const apiRoutes = [];
  const parseErrors = [];

  for (const absoluteFile of files) {
    const relativeFile = normalizePath(path.relative(absoluteRoot, absoluteFile));
    const source = fs.readFileSync(absoluteFile, 'utf8');
    let ast;
    try {
      ast = parseSource(source, relativeFile);
    } catch (error) {
      parseErrors.push({ source: relativeFile, message: error.message });
      continue;
    }
    const bindings = collectBindings(ast, source);
    elements.push(...extractElements({ ast, source, relativeFile, bindings, idCounts }));

    if (/^app\/.+\/page\.(?:js|jsx|ts|tsx)$/.test(relativeFile) || /^app\/page\.(?:js|jsx|ts|tsx)$/.test(relativeFile)) {
      const route = pageRouteFromFile(relativeFile);
      const nav = routeNavigation(route, navigation);
      const roles = nav?.roles || (route === '/freelancer' ? ['FREELANCER'] : []);
      let routeBindings = bindings;
      // The login route intentionally keeps deployment branding on the server
      // while its credential form remains a client component. Inventory both
      // halves as one route contract so API and redirect coverage is not lost.
      if (relativeFile === 'app/login/page.jsx') {
        const clientSource = path.join(absoluteRoot, 'app', 'login', 'LoginForm.jsx');
        if (fs.existsSync(clientSource)) {
          const clientText = fs.readFileSync(clientSource, 'utf8');
          routeBindings = mergeBindings(bindings, collectBindings(parseSource(clientText, 'app/login/LoginForm.jsx'), clientText));
        }
      }
      uiRoutes.push({
        route,
        source: relativeFile,
        dynamic: route.includes('['),
        auth: routeAuth(route, relativeFile),
        inNavigation: Boolean(nav),
        navLabel: nav?.label || '',
        navSection: nav?.section || '',
        roles,
        module: nav?.module || '',
        resourceCandidates: routeBindings.resources,
        apiCandidates: routeBindings.apiCalls.map((call) => `${call.method} ${call.endpoint}`),
        routeCandidates: routeBindings.routeTargets,
        mappingStatus: 'unreviewed',
      });
    }

    if (relativeFile.startsWith('app/api/') && /\/route\.(?:js|jsx|ts|tsx)$/.test(relativeFile)) {
      apiRoutes.push({
        route: apiRouteFromFile(relativeFile),
        source: relativeFile,
        dynamic: relativeFile.includes('['),
        methods: exportedHttpMethods(ast),
        mappingStatus: 'unreviewed',
      });
    }
  }

  uiRoutes.sort((a, b) => a.route.localeCompare(b.route));
  apiRoutes.sort((a, b) => a.route.localeCompare(b.route));
  elements.sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line || a.elementId.localeCompare(b.elementId));
  const inventory = {
    schemaVersion: 1,
    scope: ['app/**/*.{js,jsx,ts,tsx}', 'components/**/*.{js,jsx,ts,tsx}'],
    parseErrors,
    uiRoutes,
    apiRoutes,
    elements,
  };
  inventory.summary = summarize(inventory);
  return inventory;
}

function csvCell(value) {
  const normalized = Array.isArray(value)
    ? value.join(' | ')
    : value && typeof value === 'object'
      ? JSON.stringify(value)
      : String(value ?? '');
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function inventoryElementsCsv(inventory) {
  const fields = [
    'elementId', 'source', 'line', 'column', 'surface', 'tag', 'kind', 'label', 'handlerEvent', 'handler',
    'target', 'insideForm', 'disabledBinding', 'actionStatus', 'mappingStatus', 'businessFeature',
    'resourceCandidates', 'apiCandidates', 'routeCandidates', 'uxRiskCandidates',
  ];
  return `${fields.map(csvCell).join(',')}\n${inventory.elements.map((row) => fields.map((field) => csvCell(row[field])).join(',')).join('\n')}\n`;
}

export function inventoryRoutesCsv(inventory) {
  const fields = [
    'route', 'source', 'dynamic', 'auth', 'inNavigation', 'navLabel', 'navSection', 'roles', 'module',
    'resourceCandidates', 'apiCandidates', 'routeCandidates', 'mappingStatus',
  ];
  return `${fields.map(csvCell).join(',')}\n${inventory.uiRoutes.map((row) => fields.map((field) => csvCell(row[field])).join(',')).join('\n')}\n`;
}

export function inventoryApiRoutesCsv(inventory) {
  const fields = ['route', 'source', 'dynamic', 'methods', 'mappingStatus'];
  return `${fields.map(csvCell).join(',')}\n${inventory.apiRoutes.map((row) => fields.map((field) => csvCell(row[field])).join(',')).join('\n')}\n`;
}

function markdownTable(rows, headers) {
  const escape = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [
    `| ${headers.map(([label]) => label).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${headers.map(([, key]) => escape(row[key])).join(' | ')} |`),
  ].join('\n');
}

export function inventoryReportMarkdown(inventory) {
  const { summary } = inventory;
  const riskRows = Object.entries(summary.uxRiskCandidates).map(([risk, count]) => ({ risk, count }));
  const routeGaps = inventory.uiRoutes
    .filter((route) => !route.inNavigation && route.auth === 'authenticated' && !route.dynamic && route.route !== '/freelancer')
    .map((route) => ({ route: route.route, source: route.source }));
  const candidateElements = inventory.elements
    .filter((element) => element.uxRiskCandidates.length)
    .slice(0, 40)
    .map((element) => ({
      id: element.elementId,
      source: `${element.source}:${element.line}`,
      label: element.label || '(không có nhãn tĩnh)',
      risks: element.uxRiskCandidates.join(', '),
    }));

  return `# Phase 1 — UI element & route inventory\n\n` +
    `Báo cáo này được sinh tự động từ AST bằng \`npm run audit:ui:inventory\`. Đây là inventory tĩnh, ` +
    `không phải kết luận rằng một candidate chắc chắn là bug.\n\n` +
    `## Phạm vi\n\n` +
    `- UI routes: **${summary.uiRoutes}**\n` +
    `- API routes: **${summary.apiRoutes}**\n` +
    `- Interactive element definitions: **${summary.interactiveElements}**\n` +
    `- Source files có interaction: **${summary.sourceFilesWithInteractions}**\n` +
    `- Routes có ERP resource candidate: **${summary.routesWithResourceCandidates}**\n` +
    `- Parse errors: **${inventory.parseErrors.length}**\n\n` +
    `## Phân loại element\n\n` +
    markdownTable(Object.entries(summary.byKind).map(([kind, count]) => ({ kind, count })), [['Loại', 'kind'], ['Số lượng', 'count']]) +
    `\n\n## UX risk candidates cần review thủ công\n\n` +
    (riskRows.length ? markdownTable(riskRows, [['Candidate', 'risk'], ['Số lượng', 'count']]) : 'Không có candidate.') +
    `\n\nCác candidate ưu tiên accessibility, keyboard, semantic control và possible no-op theo checklist UI/UX. ` +
    `Danh sách đầy đủ nằm trong \`inventory.json\` và \`elements.csv\`.\n\n` +
    `### 40 candidate đầu tiên\n\n` +
    (candidateElements.length
      ? markdownTable(candidateElements, [['Element ID', 'id'], ['Source', 'source'], ['Nhãn', 'label'], ['Candidates', 'risks']])
      : 'Không có candidate.') +
    `\n\n## Authenticated routes chưa nằm trong primary navigation\n\n` +
    (routeGaps.length
      ? markdownTable(routeGaps, [['Route', 'route'], ['Source', 'source']])
      : 'Không có route bất thường.') +
    `\n\nDynamic detail routes và route Freelancer được loại khỏi danh sách này vì có entry path riêng.\n\n` +
    `## Giới hạn Phase 1\n\n` +
    `- Button sinh từ một JSX template trong \`.map()\` được ghi một definition, không nhân theo số record runtime.\n` +
    `- API/resource candidates đang gắn ở cấp source file; Phase 2 sẽ truy handler cụ thể tới API/model.\n` +
    `- \`uxRiskCandidates\` là hàng chờ review, không tự động được coi là defect.\n` +
    `- Element ID dựa trên surface + loại + nhãn/handler nên ổn định khi chỉ thay đổi số dòng.\n`;
}

export function renderInventoryArtifacts(inventory) {
  return {
    'inventory.json': `${JSON.stringify(inventory, null, 2)}\n`,
    'elements.csv': inventoryElementsCsv(inventory),
    'ui-routes.csv': inventoryRoutesCsv(inventory),
    'api-routes.csv': inventoryApiRoutesCsv(inventory),
    'PHASE-1-REPORT.md': inventoryReportMarkdown(inventory),
  };
}
