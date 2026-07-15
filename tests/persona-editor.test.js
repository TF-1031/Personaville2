const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = { console, fetch: async () => { throw new Error('fetch unused'); }, XLSX: null };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/database.js', 'utf8'), context);

const raw = JSON.parse(fs.readFileSync('database/persona-db.json', 'utf8'));
context.applyRawDatabase(raw, {source: 'bundled', filename: 'database/persona-db.json'});
context.startEditingSession();

const next = context.nextSafePersonaID();
assert(!context.databaseState().personas.some(p => p.PersonaID === next), 'nextSafePersonaID must not reuse an existing ID');
const created = context.savePersonaDraft({
  PersonaID: next,
  PersonaName: 'Test Persona',
  FamilyGroup: 'Test Family',
  FamilyGroupID: 'FG_TEST',
  PricingSet: 'Standard',
  PricingSetID: 'STD',
  Status: 'Draft',
  PromoIcon: '',
  EquipInc: 'TRUE',
  SymSpeed: 'FALSE',
  DisclaimerID: '',
  Notes: 'created by test'
}, '', 'Unit Test');
assert.strictEqual(created.PersonaID, next, 'created persona uses generated ID');
assert.strictEqual(created.ModifiedBy, 'Unit Test', 'save updates ModifiedBy');
assert(created.ModifiedDate, 'save updates ModifiedDate');
assert.throws(() => context.savePersonaDraft({...created}, '', 'Unit Test'), /PersonaID already exists/, 'duplicate IDs are rejected');

const first = context.databaseState().personas.find(p => context.personaHasRelationships(p.PersonaID));
assert(first, 'fixture should include a persona with relationships');
const counts = context.personaRelationships(first.PersonaID);
assert(counts.speeds > 0 || counts.modifiers > 0 || counts.disclaimers > 0, 'relationship counts are exposed');
const copy = context.duplicatePersona(first.PersonaID, 'Unit Test');
assert.notStrictEqual(copy.PersonaID, first.PersonaID, 'duplicate gets a new safe ID');
assert(copy.PersonaName.includes('Copy'), 'duplicate is visibly named as a copy');

const deleted = context.markPersonaDeleted(copy.PersonaID, 'Unit Test');
assert.strictEqual(deleted.Status, 'Deleted', 'delete action marks status instead of removing row');
assert(context.databaseState().personas.some(p => p.PersonaID === copy.PersonaID), 'marked deleted persona remains in working copy');
context.runDatabaseHealth();
assert(Array.isArray(context.databaseState().health), 'Database Health can be run after editor saves');

console.log('Persona Editor data helpers create, validate, duplicate, and mark personas deleted safely.');
