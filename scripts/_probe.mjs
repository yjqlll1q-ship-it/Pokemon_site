const r = await fetch('https://pokeapi.co/api/v2/location?limit=2000');
const j = await r.json();
console.log(j.results.filter((x) => /route-217|eterna/.test(x.name)).map((x) => x.name).join('\n'));
