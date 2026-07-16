const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = { console, fetch: async () => { throw new Error('fetch unused'); }, XLSX: null };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/database.js', 'utf8'), context);

context.setPersonaCurrentDateProvider(() => '2026-07-16');
const raw = JSON.parse(fs.readFileSync('database/persona-db.json', 'utf8'));
context.applyRawDatabase(raw, {source:'bundled', filename:'database/persona-db.json'});

const legacy = context.databaseState().personas.find(p => p.Status === 'Active' && !p.EffectiveStartDate && !p.EffectiveEndDate);
assert(legacy, 'fixture includes a legacy active persona');
assert.strictEqual(context.personaLifecycleStatus(legacy), 'Active', 'legacy active records without dates remain active');

assert.strictEqual(context.personaLifecycleStatus({Status:'Active', EffectiveStartDate:'2026-08-01'}), 'Scheduled');
assert.strictEqual(context.personaLifecycleStatus({Status:'Active', EffectiveStartDate:'2026-01-01', EffectiveEndDate:'2026-07-16'}), 'Active');
assert.strictEqual(context.personaLifecycleStatus({Status:'Active', EffectiveEndDate:'2026-07-15'}), 'Expired');
assert.strictEqual(context.personaLifecycleStatus({Status:'Active', LifecycleStatusOverride:'Inactive'}), 'Inactive');

context.startEditingSession();
const source = legacy.PersonaID;
const preview = context.createUpdatedPersonaVersion(source, '2026-08-01', false, 'Unit Test');
assert.strictEqual(preview.newDraft.SupersedesPersonaID, source, 'preview links replacement to source');
assert.strictEqual(preview.sourceAfter.EffectiveEndDate, '2026-07-31', 'preview suggests source end date one day earlier');
assert(!context.databaseState().personas.some(p => p.PersonaID === preview.newDraft.PersonaID), 'preview does not silently overwrite source or add draft');
const saved = context.createUpdatedPersonaVersion(source, '2026-08-01', true, 'Unit Test');
assert(saved.PersonaID !== source, 'confirmed replacement gets a new PersonaID');
assert.strictEqual(saved.SupersedesPersonaID, source, 'confirmed replacement stores SupersedesPersonaID');
assert.strictEqual(context.databaseState().personas.find(p => p.PersonaID === source).EffectiveEndDate, '2026-07-31', 'confirmed replacement updates source end date');

const invalidRaw = JSON.parse(JSON.stringify(raw));
invalidRaw['05_Personas'].push({PersonaID:'PM_BAD', PersonaName:'Bad', Status:'Active', EffectiveStartDate:'2026-13-40', SupersedesPersonaID:'PM_MISSING'});
context.applyRawDatabase(invalidRaw, {source:'bundled', filename:'bad.json'});
const health = context.runDatabaseHealth().find(row => row.Check === 'Persona lifecycle scheduling');
assert.strictEqual(health.Status, 'BAD', 'health reports malformed dates and missing supersedes targets');
console.log('Persona lifecycle scheduling and version replacement helpers pass.');
