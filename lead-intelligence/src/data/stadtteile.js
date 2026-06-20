/**
 * Stadtteil-Listen für Tiefen-Suche (Quartier-Rotation).
 *
 * Eine Stadt-weite Google-Places-Suche liefert nur die prominentesten Betriebe
 * (= meist gute Websites). Pro Stadtteil zu suchen bricht diesen Prominenz-Bias
 * und holt die kleinen Quartier-Betriebe mit vernachlässigten Seiten — genau die
 * gesuchten Leads.
 *
 * @module data/stadtteile
 */

export const STADTTEILE = {
    'köln': ['Ehrenfeld', 'Nippes', 'Deutz', 'Sülz', 'Lindenthal', 'Mülheim', 'Porz', 'Kalk', 'Rodenkirchen', 'Chorweiler', 'Dellbrück', 'Zollstock'],
    'berlin': ['Kreuzberg', 'Neukölln', 'Prenzlauer Berg', 'Friedrichshain', 'Charlottenburg', 'Schöneberg', 'Mitte', 'Wedding', 'Spandau', 'Steglitz', 'Tempelhof', 'Lichtenberg', 'Pankow', 'Reinickendorf'],
    'münchen': ['Schwabing', 'Haidhausen', 'Sendling', 'Bogenhausen', 'Pasing', 'Maxvorstadt', 'Giesing', 'Neuhausen', 'Laim', 'Moosach', 'Trudering', 'Berg am Laim'],
    'hamburg': ['Altona', 'Eimsbüttel', 'Wandsbek', 'Barmbek', 'Eppendorf', 'Ottensen', 'Harburg', 'Bergedorf', 'Winterhude', 'St. Pauli', 'Eilbek', 'Rahlstedt'],
    'frankfurt': ['Sachsenhausen', 'Bornheim', 'Nordend', 'Bockenheim', 'Westend', 'Höchst', 'Niederrad', 'Rödelheim', 'Eschersheim', 'Gallus', 'Ostend'],
    'stuttgart': ['Bad Cannstatt', 'Vaihingen', 'Feuerbach', 'Degerloch', 'Zuffenhausen', 'Möhringen', 'Untertürkheim', 'Weilimdorf', 'Botnang', 'Sillenbuch', 'Stammheim', 'Plieningen', 'Obertürkheim', 'Hedelfingen', 'Mühlhausen', 'Stuttgart-West', 'Stuttgart-Ost', 'Stuttgart-Süd', 'Stuttgart-Nord'],
    'düsseldorf': ['Bilk', 'Flingern', 'Pempelfort', 'Oberkassel', 'Derendorf', 'Gerresheim', 'Benrath', 'Eller', 'Unterbilk', 'Friedrichstadt'],
    'dortmund': ['Hörde', 'Aplerbeck', 'Hombruch', 'Brackel', 'Eving', 'Mengede', 'Huckarde', 'Scharnhorst'],
    'essen': ['Rüttenscheid', 'Borbeck', 'Steele', 'Werden', 'Kettwig', 'Altendorf', 'Frohnhausen'],
    'leipzig': ['Plagwitz', 'Connewitz', 'Gohlis', 'Lindenau', 'Stötteritz', 'Reudnitz', 'Schleußig'],
    'nürnberg': ['Gostenhof', 'Johannis', 'Wöhrd', 'St. Johannis', 'Mögeldorf', 'Langwasser', 'Eibach'],
    'hannover': ['Linden', 'List', 'Südstadt', 'Vahrenwald', 'Kleefeld', 'Ricklingen', 'Bothfeld']
};

/** Bis zu n zufällige Stadtteile für die übergebene Stadt (leer, wenn unbekannt). */
export function pickDistricts(city, n = 6) {
    const key = String(city || '').trim().toLowerCase();
    const list = STADTTEILE[key];
    if (!list || !list.length) return [];
    // Fisher-Yates-artige Zufallsauswahl (deterministisch genug; vermeidet Math.random-Bias)
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, Math.min(n, arr.length));
}
