import fs from 'node:fs';
import path from 'node:path';
import parserPackage from '@babel/parser';
import { RESOURCES } from '../../lib/registry.js';
import { buildUiInventory } from './ui-inventory.mjs';

const { parse } = parserPackage;
const HANDLER_PRIORITY = [
  'onClick', 'onSubmit', 'onPointerDown', 'onMouseDown', 'onDoubleClick', 'onTouchStart',
  'onChange', 'onInput', 'onKeyDown',
];
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const ROLE_NAMES = new Set(['DIRECTOR', 'PM', 'AM', 'ACCOUNTANT', 'HR', 'LEAD', 'STAFF', 'FREELANCER']);
const PRISMA_OPERATIONS = new Set([
  'findMany', 'findUnique', 'findFirst', 'count', 'aggregate', 'groupBy',
  'create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany',
]);

function parseSource(source, filename) {
  return parse(source, {
    sourceType: 'unambiguous',
    sourceFilename: filename,
    errorRecovery: false,
    plugins: [
      'jsx', 'typescript', 'classProperties', 'classPrivateProperties', 'classPrivateMethods',
      'dynamicImport', 'importMeta', 'optionalChaining', 'nullishCoalescingOperator',
      'objectRestSpread', 'topLevelAwait',
    ],
  });
}

function walk(node, visitor, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  visitor(node, ancestors);
  const nextAncestors = [...ancestors, node];
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visitor, nextAncestors);
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, visitor, nextAncestors);
    }
  }
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function nodeCode(node, source, maxLength = 280) {
  if (!node || typeof node.start !== 'number' || typeof node.end !== 'number') return '';
  return source.slice(node.start, node.end).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function jsxName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') return `${jsxName(node.object)}.${jsxName(node.property)}`;
  return '';
}

function propertyName(node) {
  if (!node) return '';
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') return String(node.value);
  return '';
}

function calleeChain(node) {
  if (!node) return [];
  if (node.type === 'Identifier') return [node.name];
  if (node.type === 'ThisExpression') return ['this'];
  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    const object = calleeChain(node.object);
    const property = node.computed ? propertyName(node.property) || '*' : propertyName(node.property);
    return [...object, property].filter(Boolean);
  }
  return [];
}

function literalValue(node) {
  if (!node) return undefined;
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral' || node.type === 'BooleanLiteral') return node.value;
  if (node.type === 'NullLiteral') return null;
  return undefined;
}

function expressionOfAttribute(attribute) {
  if (!attribute || attribute.type !== 'JSXAttribute') return null;
  if (!attribute.value) return null;
  if (attribute.value.type === 'JSXExpressionContainer') return attribute.value.expression;
  return attribute.value;
}

function attributesOf(openingElement) {
  const attributes = new Map();
  for (const attribute of openingElement.attributes || []) {
    if (attribute.type !== 'JSXAttribute') continue;
    attributes.set(propertyName(attribute.name), expressionOfAttribute(attribute));
  }
  return attributes;
}

function functionName(node, ancestors = []) {
  if (node?.type === 'FunctionDeclaration' && node.id?.name) return node.id.name;
  const all = [...ancestors, node].filter(Boolean).reverse();
  for (const candidate of all) {
    if (candidate.type === 'FunctionDeclaration' && candidate.id?.name) return candidate.id.name;
    if (candidate.type === 'VariableDeclarator' && candidate.id?.type === 'Identifier'
      && ['ArrowFunctionExpression', 'FunctionExpression'].includes(candidate.init?.type)) return candidate.id.name;
  }
  return '';
}

function sourceSurface(relativeFile) {
  if (relativeFile.startsWith('app/')) {
    const segments = relativeFile.split('/').slice(1, -1).filter((segment) => !/^\(.+\)$/.test(segment));
    return `route:${segments.length ? `/${segments.join('/')}` : '/'}`;
  }
  return `component:${relativeFile.replace(/^components\//, '').replace(/\.[^.]+$/, '')}`;
}

function endpointExpression(node, analysis, depth = 0) {
  if (!node || depth > 5) return '';
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral') {
    let value = '';
    for (let index = 0; index < node.quasis.length; index += 1) {
      value += node.quasis[index].value.cooked || node.quasis[index].value.raw || '';
      if (index < node.expressions.length) value += '*';
    }
    return value;
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = endpointExpression(node.left, analysis, depth + 1);
    const right = endpointExpression(node.right, analysis, depth + 1);
    if (!left && !right) return '';
    return `${left || '*'}${right || '*'}`;
  }
  if (node.type === 'Identifier' && analysis.variableExpressions.has(node.name)) {
    return endpointExpression(analysis.variableExpressions.get(node.name), analysis, depth + 1);
  }
  if (node.type === 'ConditionalExpression') {
    const yes = endpointExpression(node.consequent, analysis, depth + 1);
    const no = endpointExpression(node.alternate, analysis, depth + 1);
    return yes && yes === no ? yes : '';
  }
  return '';
}

function methodFromOptions(node) {
  if (!node || node.type !== 'ObjectExpression') return 'GET';
  const property = node.properties.find((entry) => entry.type === 'ObjectProperty' && propertyName(entry.key) === 'method');
  const value = literalValue(property?.value);
  return typeof value === 'string' ? value.toUpperCase() : property ? 'DYNAMIC' : 'GET';
}

function endpointPath(endpoint) {
  return String(endpoint || '').split('?')[0].replace(/\/+$/, '') || '/';
}

function routeMatches(endpoint, route) {
  const endpointSegments = endpointPath(endpoint).split('/').filter(Boolean);
  const routeSegments = endpointPath(route).split('/').filter(Boolean);
  if (endpointSegments.length !== routeSegments.length) return false;
  return routeSegments.every((segment, index) => {
    if (/^\[.+\]$/.test(segment)) return true;
    return endpointSegments[index] === segment || endpointSegments[index] === '*';
  });
}

function createTrace() {
  return {
    apiCalls: new Map(),
    resourceOps: new Map(),
    routeTargets: new Set(),
    callbacks: new Set(),
    functionChain: new Set(),
    stateSetters: new Set(),
    browserActions: new Set(),
    helperCalls: new Set(),
    localMutations: new Set(),
    toastCalls: new Set(),
    hasCatch: false,
    hasResponseCheck: false,
    hasConfirmation: false,
  };
}

function mergeTrace(target, source) {
  for (const [key, value] of source.apiCalls) target.apiCalls.set(key, value);
  for (const [key, value] of source.resourceOps) target.resourceOps.set(key, value);
  for (const key of ['routeTargets', 'callbacks', 'functionChain', 'stateSetters', 'browserActions', 'helperCalls', 'localMutations', 'toastCalls']) {
    for (const value of source[key]) target[key].add(value);
  }
  target.hasCatch ||= source.hasCatch;
  target.hasResponseCheck ||= source.hasResponseCheck;
  target.hasConfirmation ||= source.hasConfirmation;
  return target;
}

function resourceOperation(resource, operation) {
  const normalizedOperation = operation === 'create' ? 'create'
    : operation === 'update' ? 'update'
      : operation === 'remove' ? 'delete'
        : 'read';
  const method = normalizedOperation === 'create' ? 'POST'
    : normalizedOperation === 'update' ? 'PUT'
      : normalizedOperation === 'delete' ? 'DELETE'
        : 'GET';
  const endpoint = ['update', 'delete'].includes(normalizedOperation)
    ? `/api/data/${resource}/[id]`
    : `/api/data/${resource}`;
  return { resource, operation: normalizedOperation, method, endpoint };
}

function concreteResourceFromEndpoint(endpoint, method) {
  const match = endpointPath(endpoint).match(/^\/api\/data\/([^/*\[]+)(?:\/[*\[].*)?$/);
  if (!match) return null;
  const operation = method === 'POST' ? 'create' : ['PUT', 'PATCH'].includes(method) ? 'update' : method === 'DELETE' ? 'delete' : 'read';
  return { resource: match[1], operation, method, endpoint };
}

function traceNode(node, analysis, trace = createTrace(), options = {}) {
  if (!node) return trace;
  const visitedFunctions = options.visitedFunctions || new Set();

  const traceFunction = (name) => {
    if (!name || visitedFunctions.has(name) || !analysis.functions.has(name)) return false;
    visitedFunctions.add(name);
    trace.functionChain.add(name);
    traceNode(analysis.functions.get(name), analysis, trace, { visitedFunctions });
    return true;
  };

  if (node.type === 'Identifier') {
    const resolved = traceFunction(node.name);
    if (!resolved && (/^on[A-Z]/.test(node.name) || analysis.componentProps.has(node.name))) trace.callbacks.add(node.name);
    else if (!resolved && analysis.hookAliases.has(node.name)) trace.helperCalls.add(`hook:${node.name}`);
    else if (!resolved && analysis.importedIdentifiers.has(node.name)) trace.helperCalls.add(`import:${node.name}`);
  }

  walk(node, (current) => {
    if (current.type === 'CatchClause') trace.hasCatch = true;
    if (current.type === 'AssignmentExpression') {
      const chain = calleeChain(current.left);
      if (chain[0] === 'window' && chain.includes('location')) {
        const target = endpointExpression(current.right, analysis);
        if (target) trace.routeTargets.add(target);
      } else {
        trace.localMutations.add(nodeCode(current.left, analysis.source, 120) || 'assignment');
      }
    }
    if (current.type === 'UpdateExpression') {
      trace.localMutations.add(nodeCode(current.argument, analysis.source, 120) || 'update');
    }
    if ((current.type === 'MemberExpression' || current.type === 'OptionalMemberExpression')
      && ['ok', 'status'].includes(propertyName(current.property))) trace.hasResponseCheck = true;
    if (current.type !== 'CallExpression' && current.type !== 'OptionalCallExpression') return;

    const chain = calleeChain(current.callee);
    const base = chain[0] || '';
    const member = chain.at(-1) || '';

    if (base === 'fetch') {
      const endpoint = endpointExpression(current.arguments[0], analysis);
      const method = methodFromOptions(current.arguments[1]);
      if (endpoint) {
        const call = { endpoint, method };
        trace.apiCalls.set(`${method} ${endpoint}`, call);
        const resource = concreteResourceFromEndpoint(endpoint, method);
        if (resource) trace.resourceOps.set(`${resource.operation}:${resource.resource}`, resource);
      }
      return;
    }

    if (chain.length === 2 && analysis.resourceObjects.has(base)
      && ['create', 'update', 'remove', 'refresh'].includes(member)) {
      const resource = resourceOperation(analysis.resourceObjects.get(base), member);
      trace.resourceOps.set(`${resource.operation}:${resource.resource}`, resource);
      trace.apiCalls.set(`${resource.method} ${resource.endpoint}`, { endpoint: resource.endpoint, method: resource.method });
    } else if (chain.length === 1 && analysis.resourceAliases.has(base)) {
      const binding = analysis.resourceAliases.get(base);
      const resource = resourceOperation(binding.resource, binding.operation);
      trace.resourceOps.set(`${resource.operation}:${resource.resource}`, resource);
      trace.apiCalls.set(`${resource.method} ${resource.endpoint}`, { endpoint: resource.endpoint, method: resource.method });
    }

    const isRouterNavigation = ['push', 'replace'].includes(member) && /router$/i.test(base);
    const isLocationNavigation = member === 'assign'
      && (base === 'location' || (base === 'window' && chain.includes('location')));
    if ((isRouterNavigation || isLocationNavigation) && current.arguments[0]) {
      const target = endpointExpression(current.arguments[0], analysis) || nodeCode(current.arguments[0], analysis.source);
      if (target) trace.routeTargets.add(target);
    }
    if (base === 'signOut') trace.routeTargets.add('/login');

    if (chain.length === 1 && analysis.stateSetters.has(base)) trace.stateSetters.add(base);
    if (base === 'toast' || member === 'toast') trace.toastCalls.add(nodeCode(current, analysis.source, 160));
    if (base === 'confirm' || member === 'confirm') trace.hasConfirmation = true;
    if (['window', 'document', 'navigator', 'URL'].includes(base)) trace.browserActions.add(chain.join('.'));
    if (['stopPropagation', 'preventDefault'].includes(member)) trace.localMutations.add(`event.${member}`);
    if (['click', 'focus', 'blur', 'scrollIntoView'].includes(member) && nodeCode(current.callee, analysis.source).includes('.current')) {
      trace.browserActions.add(`ref.${member}`);
    }
    if (['add', 'delete', 'clear', 'set'].includes(member)
      && (nodeCode(current.callee, analysis.source).includes('.current') || /Ref$/.test(base))) {
      trace.localMutations.add(nodeCode(current.callee, analysis.source, 120));
    }

    if (chain.length === 1) {
      const resolved = traceFunction(base);
      if (!resolved && (/^on[A-Z]/.test(base) || analysis.componentProps.has(base))) trace.callbacks.add(base);
      else if (!resolved && analysis.hookAliases.has(base)) trace.helperCalls.add(`hook:${base}`);
      else if (!resolved && analysis.importedIdentifiers.has(base)) trace.helperCalls.add(`import:${base}`);
    }
  });
  return trace;
}

function collectSourceAnalysis(root, relativeFile, inventoryElements) {
  const absolute = path.join(root, relativeFile);
  const source = fs.readFileSync(absolute, 'utf8');
  const ast = parseSource(source, relativeFile);
  const analysis = {
    relativeFile,
    source,
    ast,
    functions: new Map(),
    variableExpressions: new Map(),
    resourceObjects: new Map(),
    resourceAliases: new Map(),
    contextResources: new Set(),
    stateSetters: new Set(),
    componentProps: new Set(),
    hookAliases: new Set(),
    importedIdentifiers: new Set(),
    elementHandlers: new Map(),
    usages: [],
  };

  walk(ast, (node, ancestors) => {
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers || []) {
        if (specifier.local?.name) analysis.importedIdentifiers.add(specifier.local.name);
      }
    }
    if (node.type === 'FunctionDeclaration' && node.id?.name) analysis.functions.set(node.id.name, node.body);
    if (node.type === 'FunctionDeclaration') {
      for (const param of node.params || []) {
        if (param.type !== 'ObjectPattern') continue;
        for (const property of param.properties) {
          if (property.type === 'ObjectProperty' && property.value?.type === 'Identifier') analysis.componentProps.add(property.value.name);
        }
      }
    }
    if (node.type !== 'VariableDeclarator') return;
    if (node.id?.type === 'Identifier' && node.init) {
      analysis.variableExpressions.set(node.id.name, node.init);
      if (['ArrowFunctionExpression', 'FunctionExpression'].includes(node.init.type)) {
        analysis.functions.set(node.id.name, node.init.body);
      }
      if (node.init.type === 'CallExpression'
        && ['useCallback', 'useMemo'].includes(calleeChain(node.init.callee).at(-1))
        && ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.init.arguments[0]?.type)) {
        analysis.functions.set(node.id.name, node.init.arguments[0].body);
      }
    }
    if (node.id?.type === 'ObjectPattern' && node.init?.type === 'CallExpression'
      && /^use[A-Z]/.test(calleeChain(node.init.callee).at(-1) || '')
      && calleeChain(node.init.callee).at(-1) !== 'useResource') {
      for (const property of node.id.properties) {
        if (property.type !== 'ObjectProperty') continue;
        const local = property.value?.type === 'Identifier' ? property.value.name : propertyName(property.value);
        if (local) analysis.hookAliases.add(local);
      }
    }
    if (node.id?.type === 'ArrayPattern' && node.init?.type === 'CallExpression'
      && calleeChain(node.init.callee).at(-1) === 'useState') {
      const setter = node.id.elements[1];
      if (setter?.type === 'Identifier') analysis.stateSetters.add(setter.name);
    }
    if (node.init?.type !== 'CallExpression' || calleeChain(node.init.callee).at(-1) !== 'useResource') return;
    const resource = literalValue(node.init.arguments[0]);
    if (typeof resource !== 'string') return;
    analysis.contextResources.add(resource);
    if (node.id.type === 'Identifier') analysis.resourceObjects.set(node.id.name, resource);
    if (node.id.type === 'ObjectPattern') {
      for (const property of node.id.properties) {
        if (property.type !== 'ObjectProperty') continue;
        const operation = propertyName(property.key);
        const local = property.value?.type === 'Identifier' ? property.value.name : propertyName(property.value);
        if (local && ['create', 'update', 'remove', 'refresh'].includes(operation)) {
          analysis.resourceAliases.set(local, { resource, operation });
        }
      }
    }
  });

  const expectedLocations = new Set(inventoryElements.map((element) => `${element.line}:${element.column}`));
  walk(ast, (node, ancestors) => {
    if (node.type !== 'JSXElement') return;
    const line = node.loc?.start.line || 0;
    const column = (node.loc?.start.column || 0) + 1;
    const location = `${line}:${column}`;
    const tag = jsxName(node.openingElement.name);
    const attributes = attributesOf(node.openingElement);

    if (expectedLocations.has(location)) {
      let handlerEvent = HANDLER_PRIORITY.find((name) => attributes.has(name));
      let handlerNode = handlerEvent ? attributes.get(handlerEvent) : null;
      if (!handlerNode) {
        const parentForm = ancestors.slice().reverse().find(
          (ancestor) => ancestor.type === 'JSXElement' && jsxName(ancestor.openingElement.name) === 'form',
        );
        const formAttributes = parentForm ? attributesOf(parentForm.openingElement) : null;
        if (formAttributes?.has('onSubmit')) {
          handlerEvent = 'form:onSubmit';
          handlerNode = formAttributes.get('onSubmit');
        }
      }
      analysis.elementHandlers.set(location, {
        tag,
        handlerEvent: handlerEvent || '',
        handlerNode,
        ownerComponent: functionName(node, ancestors),
      });
    }

    if (/^[A-Z]/.test(tag)) {
      const props = new Map();
      for (const [name, expression] of attributes) props.set(name, expression);
      analysis.usages.push({
        component: tag.split('.').at(-1),
        ownerComponent: functionName(node, ancestors),
        source: relativeFile,
        line,
        props,
      });
    }
  });

  return analysis;
}

function prismaModels(root) {
  const schema = fs.readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');
  return new Map([...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => {
    const model = match[1];
    return [`${model[0].toLowerCase()}${model.slice(1)}`, model];
  }));
}

function resolveLocalModule(root, fromFile, request) {
  if (!request.startsWith('@/') && !request.startsWith('.')) return '';
  const base = request.startsWith('@/')
    ? path.join(root, request.slice(2))
    : path.resolve(path.dirname(path.join(root, fromFile)), request);
  const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, path.join(base, 'index.js')];
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return found ? normalizePath(path.relative(root, found)) : '';
}

function loadApiModule(root, relativeFile, cache) {
  if (cache.has(relativeFile)) return cache.get(relativeFile);
  const source = fs.readFileSync(path.join(root, relativeFile), 'utf8');
  const ast = parseSource(source, relativeFile);
  const module = { relativeFile, source, ast, functions: new Map(), imports: new Map() };
  cache.set(relativeFile, module);
  walk(ast, (node) => {
    if (node.type === 'ImportDeclaration') {
      const target = resolveLocalModule(root, relativeFile, node.source.value);
      if (!target) return;
      for (const specifier of node.specifiers || []) {
        const imported = specifier.type === 'ImportDefaultSpecifier' ? 'default' : propertyName(specifier.imported);
        if (specifier.local?.name) module.imports.set(specifier.local.name, { target, imported });
      }
    }
    if (node.type === 'FunctionDeclaration' && node.id?.name) module.functions.set(node.id.name, node.body);
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
      && ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.init?.type)) {
      module.functions.set(node.id.name, node.init.body);
    }
    if (node.type === 'ExportDefaultDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
      module.functions.set('default', node.declaration.body);
    }
  });
  return module;
}

function traceApiNode(root, node, module, modelNames, cache, signals, visitedFunctions) {
  if (!node) return;
  walk(node, (current) => {
    if (current.type === 'CatchClause') signals.hasErrorHandling = true;
    if (current.type === 'StringLiteral' && ROLE_NAMES.has(current.value)) signals.roles.add(current.value);
    if (current.type === 'NumericLiteral' && [400, 401, 403, 404, 409, 422, 429, 500, 503].includes(current.value)) {
      signals.statuses.add(current.value);
    }
    if (current.type !== 'CallExpression' && current.type !== 'OptionalCallExpression') return;
    const chain = calleeChain(current.callee);
    const base = chain[0] || '';
    const member = chain.at(-1) || '';
    const guardNames = new Set([
      'currentUser', 'getServerSession', 'apiUser', 'requireRealmUser', 'requireRealmAdmin',
      'hasAny', 'isDirector', 'isFreelancer', 'canRead', 'canWrite', 'canDelete',
    ]);
    if (guardNames.has(base)) signals.guards.add(base);
    if (['canRead', 'canWrite', 'canDelete'].includes(base)) signals.usesRegistry = true;
    if (base === 'resourceEnabled') signals.usesModuleGuard = true;

    const modelClient = chain.length >= 3 && PRISMA_OPERATIONS.has(member) ? chain.at(-2) : '';
    if (modelNames.has(modelClient)) signals.models.add(modelNames.get(modelClient));

    if (chain.length !== 1 || guardNames.has(base)) return;
    if (module.functions.has(base)) {
      const key = `${module.relativeFile}#${base}`;
      if (!visitedFunctions.has(key)) {
        visitedFunctions.add(key);
        traceApiNode(root, module.functions.get(base), module, modelNames, cache, signals, visitedFunctions);
      }
      return;
    }
    const imported = module.imports.get(base);
    if (!imported) return;
    const importedModule = loadApiModule(root, imported.target, cache);
    const importedBody = importedModule.functions.get(imported.imported);
    const key = `${imported.target}#${imported.imported}`;
    if (importedBody && !visitedFunctions.has(key)) {
      visitedFunctions.add(key);
      traceApiNode(root, importedBody, importedModule, modelNames, cache, signals, visitedFunctions);
    }
  });
}

function analyzeApiContract(root, apiRoute, modelNames, cache) {
  const module = loadApiModule(root, apiRoute.source, cache);
  const methods = {};
  for (const method of apiRoute.methods) {
    const signals = {
      models: new Set(), roles: new Set(), guards: new Set(), statuses: new Set(),
      usesRegistry: false, usesModuleGuard: false, hasErrorHandling: false,
    };
    const body = module.functions.get(method);
    if (body) traceApiNode(root, body, module, modelNames, cache, signals, new Set([`${apiRoute.source}#${method}`]));
    const permissionPolicy = signals.usesRegistry ? 'registry-rbac'
      : signals.roles.size || [...signals.guards].some((guard) => ['hasAny', 'isDirector', 'requireRealmAdmin'].includes(guard)) ? 'explicit-rbac'
        : signals.guards.has('apiUser') ? 'api-key-auth'
        : signals.guards.size ? 'authenticated-custom'
          : 'public-or-unverified';
    methods[method] = {
      models: [...signals.models].sort(),
      roles: [...signals.roles].sort(),
      guards: [...signals.guards].sort(),
      statuses: [...signals.statuses].sort((a, b) => a - b),
      permissionPolicy,
      usesModuleGuard: signals.usesModuleGuard,
      hasErrorHandling: signals.hasErrorHandling,
    };
  }
  return { route: apiRoute.route, source: apiRoute.source, methods };
}

function resourcePolicy(resource, operation, modelNames) {
  const config = RESOURCES[resource];
  if (!config) return null;
  const roleField = operation === 'read' ? 'read' : operation === 'delete' ? 'del' : 'write';
  const viaDedicatedRoute = operation !== 'read' && Boolean(config.writeVia);
  const roles = viaDedicatedRoute ? [] : ['DIRECTOR', ...(config[roleField] || [])];
  return {
    resource,
    model: modelNames.get(config.model) || config.model,
    operation,
    roles: [...new Set(roles)].sort(),
    permissionPolicy: viaDedicatedRoute ? 'dedicated-route-required' : 'registry-rbac',
    rowPolicy: ['update', 'delete'].includes(operation) && Boolean(config.canWriteRow),
    scopedRead: operation === 'read' && Boolean(config.scope),
    sanitizedRead: operation === 'read' && Boolean(config.sanitize),
    validatedWrite: ['create', 'update'].includes(operation) && Boolean(config.validate),
  };
}

function apiContractFor(call, contracts) {
  const contract = contracts.find((candidate) => routeMatches(call.endpoint, candidate.route));
  if (!contract) return null;
  if (HTTP_METHODS.has(call.method)) {
    return { ...contract.methods[call.method], route: contract.route, source: contract.source, method: call.method };
  }
  const policies = Object.entries(contract.methods);
  return {
    route: contract.route,
    source: contract.source,
    method: call.method,
    models: [...new Set(policies.flatMap(([, policy]) => policy.models || []))].sort(),
    roles: [...new Set(policies.flatMap(([, policy]) => policy.roles || []))].sort(),
    guards: [...new Set(policies.flatMap(([, policy]) => policy.guards || []))].sort(),
    permissionPolicy: [...new Set(policies.map(([, policy]) => policy.permissionPolicy))].sort().join('|'),
    usesModuleGuard: policies.some(([, policy]) => policy.usesModuleGuard),
    hasErrorHandling: policies.some(([, policy]) => policy.hasErrorHandling),
  };
}

function arrayOf(setOrMap) {
  return [...setOrMap].sort();
}

function classifyAction(element, trace) {
  if (element.kind === 'navigation' || trace.routeTargets.size || element.target) return 'navigation';
  if (element.kind === 'form-control') return 'form-control';
  if (trace.resourceOps.size || trace.apiCalls.size) return 'data-action';
  if (trace.callbacks.size) return 'delegated-action';
  if (trace.browserActions.size) return 'browser-action';
  if (trace.stateSetters.size || trace.localMutations.size) return 'local-state';
  if (trace.helperCalls.size) return 'helper-action';
  if (element.kind === 'form-submit') return 'form-submit';
  return element.handler ? 'client-action' : 'unresolved-action';
}

function actionStates(element, trace, actionType, resourcePolicies, apiPolicies) {
  const dataAction = actionType === 'data-action';
  const mutating = [...trace.resourceOps.values()].some((entry) => entry.operation !== 'read')
    || [...trace.apiCalls.values()].some((entry) => !['GET', 'HEAD', 'OPTIONS'].includes(entry.method));
  const destructive = [...trace.resourceOps.values()].some((entry) => entry.operation === 'delete')
    || [...trace.apiCalls.values()].some((entry) => entry.method === 'DELETE');
  const hookManaged = resourcePolicies.length > 0;
  const asyncButtonManaged = element.tag === 'AsyncButton';
  const disabled = Boolean(element.disabledBinding);
  const loadingSignal = [...trace.stateSetters].some((name) => /(loading|saving|sending|busy|pending|submitting)/i.test(name));
  const errorSignal = trace.hasCatch || trace.hasResponseCheck || [...trace.toastCalls].some((call) => /error|lỗi|thất bại/i.test(call));
  const responseStateSignal = [...trace.stateSetters].some((name) => /messages/i.test(name));
  const successSignal = trace.toastCalls.size > 0 || hookManaged || responseStateSignal;
  const loadingState = !dataAction || !mutating ? 'not-required'
    : asyncButtonManaged ? 'async-button-guard'
      : disabled ? 'disabled-binding'
      : loadingSignal ? 'local-state'
        : hookManaged ? 'hook-refresh-without-mutation-lock'
          : 'unverified';
  const successState = !dataAction || !mutating ? 'not-required'
    : successSignal ? (hookManaged ? 'hook-refresh' : 'toast-or-state')
      : 'unverified';
  const errorState = !dataAction ? 'not-required'
    : hookManaged ? 'hook-error-toast'
      : errorSignal || apiPolicies.some((policy) => policy.hasErrorHandling) ? 'handled-candidate'
        : 'unverified';
  const confirmationState = !destructive ? 'not-required'
    : trace.hasConfirmation ? 'confirmed'
      : 'unverified';
  const candidates = [];
  if (loadingState === 'unverified' || loadingState === 'hook-refresh-without-mutation-lock') {
    candidates.push('async_loading_feedback_unverified');
  }
  if (successState === 'unverified') candidates.push('success_feedback_unverified');
  if (errorState === 'unverified') candidates.push('error_recovery_unverified');
  if (confirmationState === 'unverified') candidates.push('destructive_confirmation_unverified');
  return { loadingState, successState, errorState, confirmationState, uxStateCandidates: candidates };
}

function summarize(actionMap) {
  const countBy = (field) => actionMap.actions.reduce((counts, action) => {
    const value = action[field] || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
  const uxStateCandidates = {};
  for (const action of actionMap.actions) {
    for (const candidate of action.uxStateCandidates) {
      uxStateCandidates[candidate] = (uxStateCandidates[candidate] || 0) + 1;
    }
  }
  return {
    elements: actionMap.actions.length,
    apiContracts: actionMap.apiContracts.length,
    registryResources: Object.keys(actionMap.resourcePolicies).length,
    byActionType: countBy('actionType'),
    byMappingStatus: countBy('mappingStatus'),
    byConfidence: countBy('mappingConfidence'),
    uxStateCandidates,
    dataActions: actionMap.actions.filter((action) => action.actionType === 'data-action').length,
    delegatedBindings: actionMap.actions.reduce((total, action) => total + action.delegatedBindings.length, 0),
    actionableUnresolved: actionMap.actions.filter((action) => action.mappingStatus === 'unresolved'
      && ['action', 'form-submit'].includes(action.kind)).length,
  };
}

export function buildUiActionMap(root) {
  const inventory = buildUiInventory(root);
  const errors = [...inventory.parseErrors];
  const bySource = new Map();
  for (const element of inventory.elements) {
    if (!bySource.has(element.source)) bySource.set(element.source, []);
    bySource.get(element.source).push(element);
  }

  const analyses = new Map();
  for (const [relativeFile, elements] of bySource) {
    try {
      analyses.set(relativeFile, collectSourceAnalysis(root, relativeFile, elements));
    } catch (error) {
      errors.push({ source: relativeFile, message: error.message });
    }
  }

  const usagesByComponent = new Map();
  for (const analysis of analyses.values()) {
    for (const usage of analysis.usages) {
      if (!usagesByComponent.has(usage.component)) usagesByComponent.set(usage.component, []);
      usagesByComponent.get(usage.component).push({ ...usage, analysis });
    }
  }

  const modelNames = prismaModels(root);
  const apiModuleCache = new Map();
  const apiContracts = inventory.apiRoutes.map((route) => analyzeApiContract(root, route, modelNames, apiModuleCache));
  const resourcePolicies = Object.fromEntries(Object.entries(RESOURCES).map(([resource, config]) => [resource, {
    model: modelNames.get(config.model) || config.model,
    readRoles: ['DIRECTOR', ...(config.read || [])].filter((value, index, array) => array.indexOf(value) === index).sort(),
    writeRoles: config.writeVia ? [] : ['DIRECTOR', ...(config.write || [])].filter((value, index, array) => array.indexOf(value) === index).sort(),
    deleteRoles: config.writeVia ? [] : ['DIRECTOR', ...(config.del || [])].filter((value, index, array) => array.indexOf(value) === index).sort(),
    writeVia: config.writeVia || '',
    scopedRead: Boolean(config.scope),
    rowPolicy: Boolean(config.canWriteRow),
    sanitizedRead: Boolean(config.sanitize),
    validatedWrite: Boolean(config.validate),
  }]));

  const actions = inventory.elements.map((element) => {
    const analysis = analyses.get(element.source);
    const handler = analysis?.elementHandlers.get(`${element.line}:${element.column}`);
    const directTrace = analysis && handler?.handlerNode
      ? traceNode(handler.handlerNode, analysis)
      : createTrace();
    const delegatedTrace = createTrace();
    const delegatedBindings = [];
    const usedBy = new Set();
    if (handler?.ownerComponent && directTrace.callbacks.size) {
      for (const usage of usagesByComponent.get(handler.ownerComponent) || []) {
        for (const callback of directTrace.callbacks) {
          const expression = usage.props.get(callback);
          if (!expression) continue;
          usedBy.add(sourceSurface(usage.source));
          const usageTrace = traceNode(expression, usage.analysis);
          delegatedBindings.push({
            callback,
            source: usage.source,
            line: usage.line,
            surface: sourceSurface(usage.source),
            apiCalls: [...usageTrace.apiCalls.values()].map((call) => `${call.method} ${call.endpoint}`).sort(),
            resourceOperations: [...usageTrace.resourceOps.values()].map((entry) => `${entry.operation}:${entry.resource}`).sort(),
            routeTargets: arrayOf(usageTrace.routeTargets),
            helperCalls: arrayOf(usageTrace.helperCalls),
            localState: arrayOf(new Set([...usageTrace.stateSetters, ...usageTrace.localMutations])),
          });
          mergeTrace(delegatedTrace, usageTrace);
        }
      }
    }
    const trace = mergeTrace(directTrace, delegatedTrace);
    if (handler?.ownerComponent === 'ConfirmDialog') trace.hasConfirmation = true;
    const resourcePolicyRows = [...trace.resourceOps.values()]
      .map((entry) => resourcePolicy(entry.resource, entry.operation, modelNames))
      .filter(Boolean);
    const apiPolicyRows = [...trace.apiCalls.values()]
      .map((call) => apiContractFor(call, apiContracts))
      .filter(Boolean);
    const models = new Set(resourcePolicyRows.map((policy) => policy.model));
    const roles = new Set(resourcePolicyRows.flatMap((policy) => policy.roles));
    const permissionPolicies = new Set(resourcePolicyRows.map((policy) => policy.permissionPolicy));
    for (const policy of apiPolicyRows) {
      for (const model of policy.models || []) models.add(model);
      for (const role of policy.roles || []) roles.add(role);
      permissionPolicies.add(policy.permissionPolicy);
    }
    const actionType = classifyAction(element, trace);
    const exactData = trace.resourceOps.size > 0 || trace.apiCalls.size > 0;
    const delegatedResolved = delegatedTrace.resourceOps.size > 0 || delegatedTrace.apiCalls.size > 0;
    const classified = !['unresolved-action', 'client-action'].includes(actionType);
    const mappingStatus = exactData ? (delegatedResolved ? 'delegated-resolved' : 'handler-resolved')
      : actionType === 'delegated-action' ? 'delegated'
        : classified ? 'classified-local'
          : element.kind === 'form-control' ? 'context-only'
            : 'unresolved';
    const mappingConfidence = exactData ? (delegatedResolved ? 'medium' : 'high')
      : classified ? 'high'
        : element.resourceCandidates.length || analysis?.contextResources.size ? 'low'
          : 'none';
    const states = actionStates(element, trace, actionType, resourcePolicyRows, apiPolicyRows);
    const contextResources = new Set([
      ...(element.resourceCandidates || []),
      ...(analysis?.contextResources || []),
    ]);
    const contextModels = [...contextResources]
      .map((resource) => {
        const model = RESOURCES[resource]?.model;
        return model ? modelNames.get(model) || model : '';
      })
      .filter(Boolean);

    return {
      ...element,
      ownerComponent: handler?.ownerComponent || '',
      effectiveHandlerEvent: handler?.handlerEvent || element.handlerEvent || '',
      actionType,
      mappingStatus,
      mappingConfidence,
      handlerChain: arrayOf(trace.functionChain),
      delegatedCallbacks: arrayOf(trace.callbacks),
      delegatedBindings: delegatedBindings.sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line || a.callback.localeCompare(b.callback)),
      usedBySurfaces: arrayOf(usedBy),
      routeTargets: arrayOf(new Set([...(element.routeCandidates || []), ...trace.routeTargets])),
      apiCalls: [...trace.apiCalls.values()].map((call) => `${call.method} ${call.endpoint}`).sort(),
      resourceOperations: [...trace.resourceOps.values()].map((entry) => `${entry.operation}:${entry.resource}`).sort(),
      contextResources: arrayOf(contextResources),
      prismaModels: arrayOf(models),
      contextModels: [...new Set(contextModels)].sort(),
      permissionPolicies: arrayOf(permissionPolicies),
      allowedRoles: arrayOf(roles),
      rowPolicy: resourcePolicyRows.some((policy) => policy.rowPolicy),
      scopedRead: resourcePolicyRows.some((policy) => policy.scopedRead),
      browserActions: arrayOf(trace.browserActions),
      helperCalls: arrayOf(trace.helperCalls),
      localMutations: arrayOf(trace.localMutations),
      ...states,
    };
  });

  const actionMap = {
    schemaVersion: 2,
    sourceInventorySchemaVersion: inventory.schemaVersion,
    parseErrors: errors,
    apiContracts,
    resourcePolicies,
    actions,
  };
  actionMap.summary = summarize(actionMap);
  return actionMap;
}

function csvCell(value) {
  const normalized = Array.isArray(value)
    ? value.join(' | ')
    : value && typeof value === 'object'
      ? JSON.stringify(value)
      : String(value ?? '');
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function actionMapCsv(actionMap) {
  const fields = [
    'elementId', 'source', 'line', 'surface', 'kind', 'label', 'ownerComponent', 'effectiveHandlerEvent',
    'actionType', 'mappingStatus', 'mappingConfidence', 'handlerChain', 'delegatedCallbacks', 'usedBySurfaces',
    'routeTargets', 'apiCalls', 'resourceOperations', 'contextResources', 'prismaModels', 'contextModels',
    'permissionPolicies', 'allowedRoles', 'rowPolicy', 'scopedRead', 'loadingState', 'successState',
    'errorState', 'confirmationState', 'browserActions', 'helperCalls', 'localMutations', 'uxStateCandidates',
  ];
  const rows = actionMap.actions.map((action) => fields.map((field) => csvCell(action[field])).join(','));
  return `${fields.map(csvCell).join(',')}\n${rows.join('\n')}\n`;
}

export function unresolvedActionsCsv(actionMap) {
  const fields = ['elementId', 'source', 'line', 'label', 'kind', 'actionType', 'mappingStatus', 'mappingConfidence', 'contextResources', 'uxStateCandidates'];
  const rows = actionMap.actions
    .filter((action) => action.mappingStatus === 'unresolved' || action.uxStateCandidates.length)
    .map((action) => fields.map((field) => csvCell(action[field])).join(','));
  return `${fields.map(csvCell).join(',')}\n${rows.join('\n')}\n`;
}

export function apiContractsCsv(actionMap) {
  const fields = ['route', 'method', 'source', 'models', 'roles', 'guards', 'permissionPolicy', 'usesModuleGuard', 'hasErrorHandling', 'statuses'];
  const rows = [];
  for (const contract of actionMap.apiContracts) {
    for (const [method, policy] of Object.entries(contract.methods)) {
      const row = { route: contract.route, method, source: contract.source, ...policy };
      rows.push(fields.map((field) => csvCell(row[field])).join(','));
    }
  }
  return `${fields.map(csvCell).join(',')}\n${rows.join('\n')}\n`;
}

export function delegatedBindingsCsv(actionMap) {
  const fields = [
    'elementId', 'ownerComponent', 'callback', 'source', 'line', 'surface',
    'apiCalls', 'resourceOperations', 'routeTargets', 'helperCalls', 'localState',
  ];
  const rows = [];
  for (const action of actionMap.actions) {
    for (const binding of action.delegatedBindings) {
      const row = { elementId: action.elementId, ownerComponent: action.ownerComponent, ...binding };
      rows.push(fields.map((field) => csvCell(row[field])).join(','));
    }
  }
  return `${fields.map(csvCell).join(',')}\n${rows.join('\n')}\n`;
}

function markdownTable(rows, headers) {
  const escape = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [
    `| ${headers.map(([label]) => label).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${headers.map(([, key]) => escape(row[key])).join(' | ')} |`),
  ].join('\n');
}

export function actionMapReportMarkdown(actionMap) {
  const summary = actionMap.summary;
  const unresolved = actionMap.actions
    .filter((action) => action.mappingStatus === 'unresolved')
    .slice(0, 40)
    .map((action) => ({
      id: action.elementId,
      source: `${action.source}:${action.line}`,
      label: action.label || '(không có nhãn tĩnh)',
      context: action.contextResources.join(', ') || '—',
    }));
  const stateQueue = actionMap.actions
    .filter((action) => action.uxStateCandidates.length)
    .slice(0, 40)
    .map((action) => ({
      id: action.elementId,
      source: `${action.source}:${action.line}`,
      calls: action.apiCalls.join(', ') || action.resourceOperations.join(', '),
      candidates: action.uxStateCandidates.join(', '),
    }));
  const countRows = (values) => Object.entries(values).map(([name, count]) => ({ name, count }));

  return `# Phase 2 — UI action → API → Prisma → RBAC map\n\n` +
    `Báo cáo này được sinh tự động bằng \`npm run audit:ui:actions\`. Mapping tĩnh có mức confidence; ` +
    `candidate UX không tự động được coi là defect.\n\n` +
    `## Phạm vi\n\n` +
    `- Element definitions: **${summary.elements}**\n` +
    `- API route contracts: **${summary.apiContracts}**\n` +
    `- Registry resources: **${summary.registryResources}**\n` +
    `- Data-bound actions: **${summary.dataActions}**\n` +
    `- Delegated callback bindings: **${summary.delegatedBindings}**\n` +
    `- Actionable unresolved: **${summary.actionableUnresolved}**\n` +
    `- Parse errors: **${actionMap.parseErrors.length}**\n\n` +
    `## Phân loại action\n\n` +
    markdownTable(countRows(summary.byActionType), [['Loại', 'name'], ['Số lượng', 'count']]) +
    `\n\n## Trạng thái mapping\n\n` +
    markdownTable(countRows(summary.byMappingStatus), [['Trạng thái', 'name'], ['Số lượng', 'count']]) +
    `\n\n## Mức độ tin cậy\n\n` +
    markdownTable(countRows(summary.byConfidence), [['Confidence', 'name'], ['Số lượng', 'count']]) +
    `\n\n## UX async/feedback candidates\n\n` +
    (Object.keys(summary.uxStateCandidates).length
      ? markdownTable(countRows(summary.uxStateCandidates), [['Candidate', 'name'], ['Số lượng', 'count']])
      : 'Không có candidate.') +
    `\n\n### Hàng chờ state/feedback đầu tiên\n\n` +
    (stateQueue.length
      ? markdownTable(stateQueue, [['Element ID', 'id'], ['Source', 'source'], ['API/resource', 'calls'], ['Candidates', 'candidates']])
      : 'Không có candidate.') +
    `\n\n## Action chưa truy được target\n\n` +
    (unresolved.length
      ? markdownTable(unresolved, [['Element ID', 'id'], ['Source', 'source'], ['Nhãn', 'label'], ['Context resource', 'context']])
      : 'Không có action unresolved.') +
    `\n\n## Quy ước mapping\n\n` +
    `- \`handler-resolved\`: handler trực tiếp truy được fetch/CRUD hook.\n` +
    `- \`delegated-resolved\`: control dùng callback prop và target được truy từ component caller.\n` +
    `- \`classified-local\`: navigation, form control, local state hoặc browser action; không cần API.\n` +
    `- \`delegated\`: callback được nhận diện nhưng target phụ thuộc runtime/caller.\n` +
    `- \`unresolved\`: cần browser/manual trace trong phase kế tiếp.\n\n` +
    `## Giới hạn Phase 2\n\n` +
    `- Mapping theo definition JSX; element sinh trong \`.map()\` không nhân theo record runtime.\n` +
    `- RBAC dedicated route là static contract extraction; quyết định cuối cùng vẫn ở server.\n` +
    `- Loading/success/error là tín hiệu code tĩnh, sẽ được xác minh bằng browser/E2E sau.\n`;
}

export function renderActionMapArtifacts(actionMap) {
  return {
    'action-map.json': `${JSON.stringify(actionMap, null, 2)}\n`,
    'action-map.csv': actionMapCsv(actionMap),
    'unresolved-actions.csv': unresolvedActionsCsv(actionMap),
    'delegated-bindings.csv': delegatedBindingsCsv(actionMap),
    'api-contracts.csv': apiContractsCsv(actionMap),
    'PHASE-2-REPORT.md': `${actionMapReportMarkdown(actionMap)}\n`,
  };
}
