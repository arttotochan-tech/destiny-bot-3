import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getResetWindow } from "./time.js";
import { extractObjectsWithActivityHash } from "./bungie.js";
import { parseGrandmaster, parseList, rotationForReset } from "./community.js";

describe("getResetWindow", () => {
  it("usa el martes anterior antes del reset", () => {
    const result = getResetWindow(new Date("2026-10-20T16:59:59Z"));
    assert.equal(result.resetId, "2026-10-13");
  });

  it("cambia de semana exactamente a las 17:00 UTC", () => {
    const result = getResetWindow(new Date("2026-10-20T17:00:00Z"));
    assert.equal(result.resetId, "2026-10-20");
    assert.equal(result.endsAt.toISOString(), "2026-10-27T17:00:00.000Z");
  });
});

describe("community weekly parser", () => {
  const sample = `# Vanguard Alert - Grandmaster: [Warden of Nothing](https://example.com)\n\n### Rewards\n* Whatchamacallit\n\n* Raid: **Vow of the Disciple, Last Wish**\n* Dungeon: **Prophecy, Vesper's Host**`;

  it("extrae raids y mazmorras", () => {
    assert.deepEqual(parseList(sample, "Raid"), ["Vow of the Disciple", "Last Wish"]);
    assert.deepEqual(parseList(sample, "Dungeon"), ["Prophecy", "Vesper's Host"]);
  });

  it("extrae el gran maestro", () => {
    assert.equal(parseGrandmaster(sample), "Warden of Nothing");
  });
});

describe("calculated weekly rotation", () => {
  it("reproduce la rotación verificada del 13 de octubre", () => {
    const rotation = rotationForReset(new Date("2026-10-13T17:00:00Z"));
    assert.deepEqual(rotation.raids.map((item) => item.name), ["Voto del Discípulo", "Último Deseo"]);
    assert.deepEqual(rotation.dungeons.map((item) => item.name), ["Profecía", "Huésped Vespertino"]);
  });

  it("avanza ambos slots el 20 de octubre", () => {
    const rotation = rotationForReset(new Date("2026-10-20T17:00:00Z"));
    assert.deepEqual(rotation.raids.map((item) => item.name), ["La Caída del Rey", "Jardín de la Salvación"]);
    assert.deepEqual(rotation.dungeons.map((item) => item.name), ["Garras de la Avaricia", "Doctrina Fragmentada"]);
  });
});

describe("extractObjectsWithActivityHash", () => {
  it("encuentra actividades anidadas de milestones", () => {
    const values = extractObjectsWithActivityHash({ a: { activities: [{ activityHash: 123, modifierHashes: [7] }] } });
    assert.deepEqual(values, [{ activityHash: 123, modifierHashes: [7] }]);
  });
});
