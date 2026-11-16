// Builds the answer lists for Pin High.
//
//   node games/pin-high/build-data.js            build every prompt (cached ones are reused)
//   node games/pin-high/build-data.js golf-majors  rebuild just these ids (ignores their cache)
//   node games/pin-high/build-data.js --views      also rank by Wikipedia readers (slow: the
//                                                  reader-count service throttles; rerun to resume)
//
// Each prompt is one Wikidata query (see sparqlItems), which returns every valid answer with its
// alternative names and how well known it is. Answers are ranked by that and cut into lies: the
// best known are the bunker (what everyone blurts out), the long tail is the green, and the
// least known of all is the cup.
// To add a prompt, add a line to PROMPTS and run the script.

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'public', 'games', 'pin-high', 'data');
const CACHE = path.join(__dirname, '.cache');
const UA = 'trivia-list-builder/0.1 (node fetch)';
const MAX_ANSWERS = 1500;

const cat = (...names) => ({ cats: names });
const q = (pattern) => ({ sparql: pattern });
const COUNTRY = '?i wdt:P31 wd:Q3624078. FILTER NOT EXISTS { ?i wdt:P576 [] }';
// "Liverpool F.C." is also accepted as "Liverpool".
const CLUB_SHORT = (n) => n.replace(/(^|s)(A.?F.?C.?|F.?C.?|C.?F.?|S.?C.?|A.?C.?|S.?S.?C.?|A.?S.?|U.?S.?|U.?D.?|C.?D.?|R.?C.?D?.?|S.?V.?|B.?C.?|1.|OGC|LOSC|VfB|VfL|TSG|FSV|Calcio)(?=s|$)/g, ' ').replace(/s+/g, ' ').trim();
const letters = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

const PROMPTS = [
  // geography
  { id: 'countries', group: 'geo', text: 'Name a country', ...q(COUNTRY) },
  { id: 'countries-africa', group: 'geo', text: 'Name a country in Africa', ...q(`${COUNTRY} ?i wdt:P30 wd:Q15.`) },
  { id: 'countries-asia', group: 'geo', text: 'Name a country in Asia', ...q(`${COUNTRY} ?i wdt:P30 wd:Q48.`) },
  { id: 'countries-end-n', group: 'geo', text: 'Name a country whose name ends in the letter N', ...q(COUNTRY), keep: (n) => /n$/.test(letters(n)) },
  { id: 'countries-second-a', group: 'geo', text: 'Name a country whose second letter is A', ...q(COUNTRY), keep: (n) => letters(n)[1] === 'a' },
  { id: 'capitals', group: 'geo', text: 'Name a capital city', ...q('?c wdt:P31 wd:Q3624078; wdt:P36 ?i. FILTER NOT EXISTS { ?c wdt:P576 [] }') },
  { id: 'us-states', group: 'geo', text: 'Name a US state', ...q('?i wdt:P31 wd:Q35657.') },
  { id: 'rivers', group: 'geo', text: 'Name a river longer than 1,000 km', ...q('?i wdt:P31 wd:Q4022; wdt:P2043 ?len. FILTER(?len > 1000)') },
  { id: 'mountains', group: 'geo', text: 'Name a mountain higher than 6,000 m', ...q('?i wdt:P31 wd:Q8502; wdt:P2044 ?h. FILTER(?h > 6000 && ?h < 9000)') },
  // golf
  { id: 'golf-majors', group: 'golf', text: "Name a golfer who has won a men's major", ...cat("Winners of men's major golf championships") },
  { id: 'ryder-cup', group: 'golf', text: 'Name a golfer who has played in the Ryder Cup', ...cat('Ryder Cup competitors for Europe', 'Ryder Cup competitors for the United States') },
  { id: 'golf-hof', group: 'golf', text: 'Name a member of the World Golf Hall of Fame', ...cat('World Golf Hall of Fame inductees') },
  // sport
  { id: 'f1-champions', group: 'sport', text: 'Name a Formula One world champion', ...cat("Formula One World Drivers' Champions") },
  { id: 'ballon-dor', group: 'sport', text: "Name a Ballon d'Or winner", ...cat("Ballon d'Or winners") },
  { id: 'england-footballers', group: 'sport', text: 'Name a footballer who has played for England', ...cat("England men's international footballers") },
  { id: 'springboks', group: 'sport', text: 'Name a Springbok (South Africa rugby international)', ...cat('South Africa international rugby union players') },
  { id: 'proteas', group: 'sport', text: 'Name a South African Test cricketer', ...cat('South Africa Test cricketers') },
  { id: 'tennis-slams', group: 'sport', text: 'Name a Grand Slam singles champion (tennis)', ...cat("Grand Slam (tennis) champions in men's singles", "Grand Slam (tennis) champions in women's singles") },
  { id: 'euro-clubs', group: 'sport', text: "Name a club in the Premier League, La Liga, Serie A, the Bundesliga or Ligue 1", ...q('VALUES ?l { wd:Q9448 wd:Q324867 wd:Q15804 wd:Q82595 wd:Q13394 } ?i wdt:P118 ?l; wdt:P31 wd:Q476028.'), short: CLUB_SHORT },
  { id: 'us-teams', group: 'sport', text: 'Name an NBA, NFL, MLB or NHL team', ...q('VALUES ?l { wd:Q155223 wd:Q1215884 wd:Q1163715 wd:Q1215892 } ?i wdt:P118 ?l; wdt:P31/wdt:P279* wd:Q12973014.') },
  // music
  // film
  { id: 'directors-films', group: 'film', text: 'Name a film directed by Spielberg, Nolan, Tarantino or Scorsese', ...q('VALUES ?d { wd:Q8877 wd:Q25191 wd:Q3772 wd:Q41148 } ?i wdt:P57 ?d; wdt:P31 wd:Q11424.') },
  // science and knowledge
  { id: 'elements', group: 'science', text: 'Name a chemical element', ...q('?i wdt:P31 wd:Q11344.') },
  { id: 'constellations', group: 'science', text: 'Name a constellation', ...q('?i wdt:P31 wd:Q8928.') },
  { id: 'dog-breeds', group: 'science', text: 'Name a dog breed', ...q('?i wdt:P31 wd:Q39367.') },
  { id: 'programming-languages', group: 'science', text: 'Name a programming language', ...q('?i wdt:P31 wd:Q9143.') },
  // history and culture
  { id: 'us-presidents', group: 'history', text: 'Name a US president', ...q('?i wdt:P39 wd:Q11696; wdt:P31 wd:Q5.') },
  { id: 'greek-gods', group: 'history', text: 'Name a Greek god or goddess', ...q('?i wdt:P31 wd:Q22989102.') },
  // food and brands
  { id: 'car-makers', group: 'food', text: 'Name a car manufacturer', ...q('?i wdt:P31 wd:Q786820.') },
];

// Small builders for the query patterns below.
const FILM = 'wdt:P31 wd:Q11424';
const values = (ids) => ids.map((x) => 'wd:' + x).join(' ');
// items whose class (or other property) is the thing with this English label, so no id has to be looked up
// names live under English or, more and more, under the all-languages ('mul') label
const labelled = (labels, prop = 'wdt:P31') => `VALUES ?lbl { ${[].concat(labels).flatMap((l) => [JSON.stringify(l) + '@en', JSON.stringify(l) + '@mul']).join(' ')} } ?c rdfs:label ?lbl. ?i ${prop} ?c.`;
const songsBy = (...ids) => `VALUES ?who { ${values(ids)} } ?i wdt:P175 ?who; wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`;
const booksBy = (...ids) => `VALUES ?who { ${values(ids)} } ?i wdt:P50 ?who; wdt:P31/wdt:P279* wd:Q7725634.`;
const filmsWith = (prop, ...ids) => `VALUES ?who { ${values(ids)} } ?i ${prop} ?who; ${FILM}.`;
const playedFor = (...ids) => `VALUES ?club { ${values(ids)} } ?i wdt:P54 ?club; wdt:P31 wd:Q5.`;
const won = (...ids) => `VALUES ?award { ${values(ids)} } ?i wdt:P166 ?award.`;
const held = (...ids) => `VALUES ?post { ${values(ids)} } ?i wdt:P39 ?post; wdt:P31 wd:Q5.`;

const MORE_PROMPTS = [
  // geography
  { id: 'countries-europe', group: 'geo', text: 'Name a country in Europe', ...q(`${COUNTRY} ?i wdt:P30 wd:Q46.`) },
  { id: 'countries-americas', group: 'geo', text: 'Name a country in North or South America', ...q(`${COUNTRY} VALUES ?cont { wd:Q49 wd:Q18 } ?i wdt:P30 ?cont.`) },
  { id: 'countries-landlocked', group: 'geo', text: 'Name a landlocked country', ...q(`${COUNTRY} ?i wdt:P31 wd:Q123480.`) },
  { id: 'countries-start-s', group: 'geo', text: 'Name a country that starts with S', ...q(COUNTRY), keep: (n) => letters(n)[0] === 's' },
  { id: 'countries-start-m', group: 'geo', text: 'Name a country that starts with M', ...q(COUNTRY), keep: (n) => letters(n)[0] === 'm' },
  { id: 'countries-two-words', group: 'geo', text: 'Name a country with more than one word in its name', ...q(COUNTRY), keep: (n) => /\s/.test(n.trim()) },
  { id: 'capitals-europe', group: 'geo', text: 'Name a European capital city', ...q('?c wdt:P31 wd:Q3624078; wdt:P30 wd:Q46; wdt:P36 ?i. FILTER NOT EXISTS { ?c wdt:P576 [] }') },
  { id: 'capitals-africa', group: 'geo', text: 'Name an African capital city', ...q('?c wdt:P31 wd:Q3624078; wdt:P30 wd:Q15; wdt:P36 ?i. FILTER NOT EXISTS { ?c wdt:P576 [] }') },
  { id: 'state-capitals', group: 'geo', text: 'Name a US state capital', ...q('?st wdt:P31 wd:Q35657; wdt:P36 ?i.') },
  { id: 'sa-towns', group: 'geo', text: 'Name a city or town in South Africa', ...q('?i wdt:P17 wd:Q258; wdt:P31 ?kind. VALUES ?kind { wd:Q515 wd:Q3957 wd:Q1549591 wd:Q7930989 }') },
  { id: 'lakes', group: 'geo', text: 'Name a lake bigger than 1,000 square km', ...q('?i wdt:P31 wd:Q23397; wdt:P2046 ?area. FILTER(?area > 1000)') },
  { id: 'islands', group: 'geo', text: 'Name an island bigger than 5,000 square km', ...q('?i wdt:P31 wd:Q23442; wdt:P2046 ?area. FILTER(?area > 5000)') },
  { id: 'deserts', group: 'geo', text: 'Name a desert', ...q('?i wdt:P31 wd:Q8514.') },
  { id: 'seas', group: 'geo', text: 'Name a sea', ...q('?i wdt:P31 wd:Q165.') },
  { id: 'volcanoes', group: 'geo', text: 'Name a volcano', ...q('?i wdt:P31 ?kind. VALUES ?kind { wd:Q8072 wd:Q169358 }') },
  { id: 'currencies', group: 'geo', text: 'Name a currency in use today', ...q('?c wdt:P31 wd:Q3624078; wdt:P38 ?i. FILTER NOT EXISTS { ?c wdt:P576 [] } FILTER NOT EXISTS { ?i wdt:P582 [] }') },
  { id: 'official-languages', group: 'geo', text: 'Name an official language of a country', ...q('?c wdt:P31 wd:Q3624078; wdt:P37 ?i. FILTER NOT EXISTS { ?c wdt:P576 [] }') },
  { id: 'world-heritage', group: 'geo', text: 'Name a UNESCO World Heritage Site', ...q('?i wdt:P1435 wd:Q9259.') },
  { id: 'skyscrapers', group: 'geo', text: 'Name a building taller than 300 m', ...q('?i wdt:P31/wdt:P279* wd:Q11303; wdt:P2048 ?h. FILTER(?h > 300 && ?h < 1100)') },
  { id: 'stadiums', group: 'geo', text: 'Name a stadium that holds more than 60,000', ...q('?i wdt:P31/wdt:P279* wd:Q483110; wdt:P1083 ?cap. FILTER(?cap > 60000)') },
  { id: 'uk-universities', group: 'geo', text: 'Name a university in the United Kingdom', ...q('?i wdt:P31/wdt:P279* wd:Q3918; wdt:P17 wd:Q145.') },
  // golf
  { id: 'golf-sa', group: 'golf', text: 'Name a South African golfer', ...q('?i wdt:P106 wd:Q11303721; wdt:P27 wd:Q258.') },
  { id: 'golf-british', group: 'golf', text: 'Name a golfer from Britain or Ireland', ...q('?i wdt:P106 wd:Q11303721; wdt:P27 ?nat. VALUES ?nat { wd:Q145 wd:Q27 }') },
  { id: 'golf-courses', group: 'golf', text: 'Name a golf course', ...q('?i wdt:P31 wd:Q1048525.') },
  // sport
  { id: 'players-united', group: 'sport', text: 'Name a footballer who has played for Manchester United', ...q(playedFor('Q18656')) },
  { id: 'players-liverpool', group: 'sport', text: 'Name a footballer who has played for Liverpool', ...q(playedFor('Q1130849')) },
  { id: 'players-arsenal', group: 'sport', text: 'Name a footballer who has played for Arsenal', ...q(playedFor('Q9617')) },
  { id: 'players-chelsea', group: 'sport', text: 'Name a footballer who has played for Chelsea', ...q(playedFor('Q9616')) },
  { id: 'players-clasico', group: 'sport', text: 'Name a footballer who has played for Real Madrid or Barcelona', ...q(playedFor('Q8682', 'Q7156')) },
  { id: 'nba-legends', group: 'sport', text: 'Name a player for the Lakers, Bulls or Celtics', ...q(playedFor('Q121783', 'Q128109', 'Q131371')) },
  { id: 'f1-drivers', group: 'sport', text: 'Name a Formula One driver, past or present', ...q('?i wdt:P106 wd:Q10841764.') },
  { id: 'sports', group: 'sport', text: 'Name a sport', ...q('?i wdt:P31 wd:Q31629.') },
  { id: 'chess-gms', group: 'sport', text: 'Name a chess grandmaster', ...q('?i wdt:P2962 wd:Q105269.') },
  { id: 'astronauts', group: 'science', text: 'Name an astronaut', ...q('?i wdt:P106 wd:Q11631.') },
  // music
  { id: 'songs-classic', group: 'music', text: 'Name a song by The Beatles, Queen or ABBA', ...q(songsBy('Q1299', 'Q15862', 'Q18233')) },
  { id: 'songs-pop', group: 'music', text: 'Name a song by Taylor Swift, Adele or Ed Sheeran', ...q(songsBy('Q26876', 'Q23215', 'Q47447')) },
  { id: 'songs-kings', group: 'music', text: 'Name a song by Michael Jackson, Elvis Presley or The Rolling Stones', ...q(songsBy('Q2831', 'Q303', 'Q11036')) },
  { id: 'songs-rap', group: 'music', text: 'Name a song by Eminem, Drake or Kanye West', ...q(songsBy('Q5608', 'Q33240', 'Q15935')) },
  { id: 'songs-divas', group: 'music', text: 'Name a song by Beyoncé, Rihanna or Lady Gaga', ...q(songsBy('Q36153', 'Q36844', 'Q19848')) },
  { id: 'british-bands', group: 'music', text: 'Name a British band', ...q('?i wdt:P31 ?kind; wdt:P495 wd:Q145. VALUES ?kind { wd:Q215380 wd:Q5741069 }') },
  { id: 'music-genres', group: 'music', text: 'Name a genre of music', ...q('?i wdt:P31 wd:Q188451.') },
  { id: 'composers', group: 'music', text: 'Name a classical composer', ...q('?i wdt:P106 wd:Q36834; wdt:P136 wd:Q9730.') },
  { id: 'instruments', group: 'music', text: 'Name a musical instrument', ...q(labelled('type of musical instrument')) },
  // film and tv
  { id: 'films-pixar-disney', group: 'film', text: 'Name a Pixar or Walt Disney Animation Studios film', ...q(`${labelled(['Pixar', 'Walt Disney Animation Studios'], 'wdt:P272')} ?i wdt:P31/wdt:P279* wd:Q11424.`) },
  { id: 'films-mcu', group: 'film', text: 'Name a Marvel Cinematic Universe film', ...q(`${labelled('Marvel Cinematic Universe', 'wdt:P179|wdt:P361|wdt:P1434')} ?i ${FILM}.`) },
  { id: 'films-best-picture', group: 'film', text: 'Name a film that won the Oscar for Best Picture', ...q(`${won('Q102427')} ?i ${FILM}.`) },
  { id: 'films-masters', group: 'film', text: 'Name a film directed by Hitchcock, Kubrick, James Cameron or Ridley Scott', ...q(filmsWith('wdt:P57', 'Q7374', 'Q2001', 'Q42574', 'Q56005')) },
  { id: 'films-stars', group: 'film', text: 'Name a film starring Tom Hanks, Tom Cruise, Brad Pitt or Leonardo DiCaprio', ...q(filmsWith('wdt:P161', 'Q2263', 'Q37079', 'Q35332', 'Q38111')) },
  { id: 'oscar-actors', group: 'film', text: 'Name a winner of the Best Actor or Best Actress Oscar', ...q(`${won('Q103916', 'Q103618')} ?i wdt:P31 wd:Q5.`) },
  { id: 'tv-netflix', group: 'film', text: 'Name a Netflix or HBO original series', ...q('VALUES ?net { wd:Q907311 wd:Q23633 } ?i wdt:P449 ?net; wdt:P31/wdt:P279* wd:Q5398426.') },
  { id: 'chars-simpsons', group: 'film', text: 'Name a character from The Simpsons', ...q('?i wdt:P1441 wd:Q886; wdt:P31/wdt:P279* wd:Q95074.') },
  { id: 'chars-thrones', group: 'film', text: 'Name a character from Game of Thrones', ...q('?i wdt:P1441 ?work. VALUES ?work { wd:Q23572 wd:Q45875 }') },
  { id: 'chars-potter', group: 'film', text: 'Name a Harry Potter character', ...q(labelled(['Harry Potter universe', 'Wizarding World'], 'wdt:P1080')) },
  { id: 'chars-star-wars', group: 'film', text: 'Name a Star Wars character', ...q(`${labelled('Star Wars universe', 'wdt:P1080')} ?i wdt:P31/wdt:P279* wd:Q95074.`) },
  { id: 'chars-marvel', group: 'film', text: 'Name a Marvel or DC superhero or villain', ...q(`${labelled(['Marvel Universe', 'DC Universe'], 'wdt:P1080')} ?i wdt:P31/wdt:P279* wd:Q95074.`) },
  { id: 'pokemon', group: 'film', text: 'Name a Pokémon', ...q(labelled('Pokémon species', 'wdt:P31/wdt:P279*')) },
  { id: 'nintendo-games', group: 'film', text: 'Name a video game published by Nintendo', ...q('?i wdt:P123 wd:Q8093; wdt:P31 wd:Q7889.') },
  // books
  { id: 'books-thrillers', group: 'books', text: 'Name a book by Stephen King, Agatha Christie or Roald Dahl', ...q('VALUES ?who { wd:Q39829 wd:Q35064 wd:Q25161 } ?i wdt:P50 ?who; wdt:P31 ?kind. VALUES ?kind { wd:Q7725634 wd:Q8261 wd:Q47461344 wd:Q1279564 wd:Q49084 }') },
  { id: 'books-classics', group: 'books', text: 'Name a book by Charles Dickens, Jane Austen or J. R. R. Tolkien', ...q(booksBy('Q5686', 'Q36322', 'Q892')) },
  { id: 'nobel-literature', group: 'books', text: 'Name a winner of the Nobel Prize in Literature', ...q(`${won('Q37922')} ?i wdt:P31 wd:Q5.`) },
  // history and people
  { id: 'nobel-peace', group: 'history', text: 'Name a Nobel Peace Prize winner', ...q(won('Q35637')) },
  { id: 'nobel-science', group: 'history', text: 'Name a winner of the Nobel Prize in Physics or Chemistry', ...q(`${won('Q38104', 'Q44585')} ?i wdt:P31 wd:Q5.`) },
  { id: 'uk-pms', group: 'history', text: 'Name a British prime minister', ...q(held('Q14211')) },
  { id: 'roman-emperors', group: 'history', text: 'Name a Roman emperor', ...q(held('Q842606')) },
  { id: 'popes', group: 'history', text: 'Name a pope', ...q(held('Q19546')) },
  { id: 'sa-presidents', group: 'history', text: 'Name a president or prime minister of South Africa', ...q(`${labelled(['President of South Africa', 'State President of South Africa', 'Prime Minister of South Africa'], 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'roman-gods', group: 'history', text: 'Name a Roman god or goddess', ...q('?i wdt:P31 wd:Q11688446.') },
  { id: 'norse-gods', group: 'history', text: 'Name a Norse god or goddess', ...q(labelled(['Norse deity', 'Æsir', 'Vanir'])) },
  { id: 'ww2-battles', group: 'history', text: 'Name a battle of the Second World War', ...q('?i wdt:P31 wd:Q178561; wdt:P361 wd:Q362.') },
  { id: 'painters', group: 'history', text: 'Name a Renaissance or Impressionist painter', ...q('?i wdt:P106 wd:Q1028181; wdt:P135 ?mov. VALUES ?mov { wd:Q40415 wd:Q4692 wd:Q1474884 wd:Q131808 }') },
  { id: 'religions', group: 'history', text: 'Name a religion', ...q('?i wdt:P31 wd:Q9174.') },
  // science and nature
  { id: 'moons', group: 'science', text: 'Name a moon in the Solar System', ...q('VALUES ?planet { wd:Q2 wd:Q111 wd:Q319 wd:Q193 wd:Q324 wd:Q332 wd:Q339 } ?i wdt:P397 ?planet; wdt:P31/wdt:P279* wd:Q2537.') },
  { id: 'cat-breeds', group: 'science', text: 'Name a breed of cat', ...q('?i wdt:P31 wd:Q43577.') },
  { id: 'horse-breeds', group: 'science', text: 'Name a breed of horse', ...q('?i wdt:P31 wd:Q1160573.') },
  { id: 'colours', group: 'science', text: 'Name a colour', ...q('?i wdt:P31 wd:Q1075.') },
  { id: 'web-browsers', group: 'science', text: 'Name a web browser', ...q('?i wdt:P31 wd:Q6368.') },
  { id: 'operating-systems', group: 'science', text: 'Name an operating system', ...q('?i wdt:P31 ?kind. VALUES ?kind { wd:Q9135 wd:Q131669 }') },
  // food, drink and things
  { id: 'pasta', group: 'food', text: 'Name a type of pasta', ...q('?i wdt:P279 wd:Q178.') },
  { id: 'cheeses', group: 'food', text: 'Name a cheese', ...q('?i wdt:P279|wdt:P31 wd:Q10943.') },
  { id: 'cocktails', group: 'food', text: 'Name a cocktail', ...q(labelled('cocktail', 'wdt:P31|wdt:P279')) },
  { id: 'breads', group: 'food', text: 'Name a type of bread', ...q(labelled('bread', 'wdt:P279')) },
  { id: 'soups', group: 'food', text: 'Name a soup', ...q(labelled('soup', 'wdt:P279|wdt:P31')) },
  { id: 'spices', group: 'food', text: 'Name a herb or spice', ...q(labelled(['spice', 'herb', 'culinary herb'], 'wdt:P279|wdt:P31')) },
  { id: 'fast-food', group: 'food', text: 'Name a fast-food chain', ...q(labelled(['fast food restaurant chain', 'fast-food restaurant chain', 'fast food chain'])) },
  { id: 'beer-brands', group: 'food', text: 'Name a brand of beer', ...q(labelled(['beer brand', 'brand of beer'])) },
  { id: 'car-models', group: 'food', text: 'Name a car made by Toyota, Ford, BMW or Volkswagen', ...q('VALUES ?who { wd:Q53268 wd:Q44294 wd:Q26678 wd:Q246 } ?i wdt:P176 ?who; wdt:P31 wd:Q3231690.') },
  { id: 'airlines', group: 'food', text: 'Name an airline', ...q('?i wdt:P31 wd:Q46970. FILTER NOT EXISTS { ?i wdt:P576 [] }') },
  { id: 'board-games', group: 'food', text: 'Name a board game', ...q('?i wdt:P31 wd:Q131436.') },
  { id: 'card-games', group: 'food', text: 'Name a card game', ...q('?i wdt:P31 wd:Q142714.') },
];
PROMPTS.push(...MORE_PROMPTS);

// Every Wikidata id below was checked against its English label on 2026-11-11.
const BOOK_KINDS = 'VALUES ?kind { wd:Q7725634 wd:Q8261 wd:Q47461344 wd:Q1279564 wd:Q49084 wd:Q571 }';
const booksOf = (...ids) => `VALUES ?who { ${values(ids)} } ?i wdt:P50 ?who; wdt:P31 ?kind. ${BOOK_KINDS}`;
const WELL_KNOWN = '?i wikibase:sitelinks ?sl. FILTER(?sl >= 6)';
const job = (id) => `?i wdt:P106 wd:${id}; wdt:P31 wd:Q5. ${WELL_KNOWN}`;
const kindOf = (id) => `?i wdt:P279|wdt:P31 wd:${id}.`;

const EVEN_MORE_PROMPTS = [
  // geography and places
  { id: 'waterfalls', group: 'geo', text: 'Name a waterfall', ...q('?i wdt:P31 wd:Q34038.') },
  { id: 'national-parks', group: 'geo', text: 'Name a national park', ...q('?i wdt:P31 wd:Q46169.') },
  { id: 'castles', group: 'geo', text: 'Name a castle', ...q('?i wdt:P31 wd:Q23413.') },
  { id: 'bridges', group: 'geo', text: 'Name a bridge', ...q('?i wdt:P31 wd:Q12280.') },
  { id: 'caves', group: 'geo', text: 'Name a cave', ...q('?i wdt:P31 wd:Q35509.') },
  { id: 'peninsulas', group: 'geo', text: 'Name a peninsula', ...q('?i wdt:P31 wd:Q34763.') },
  { id: 'straits', group: 'geo', text: 'Name a strait', ...q('?i wdt:P31 wd:Q37901.') },
  { id: 'theme-parks', group: 'geo', text: 'Name a theme park', ...q('?i wdt:P31 wd:Q2416723.') },
  { id: 'museums', group: 'geo', text: 'Name a museum or art gallery', ...q(`VALUES ?k { wd:Q33506 wd:Q207694 } ?i wdt:P31 ?k. ${WELL_KNOWN}`) },
  { id: 'zoos', group: 'geo', text: 'Name a zoo', ...q('?i wdt:P31 wd:Q43501.') },
  { id: 'japan-prefectures', group: 'geo', text: 'Name a prefecture of Japan', ...q('?i wdt:P31 wd:Q50337.') },
  { id: 'german-states', group: 'geo', text: 'Name a state of Germany', ...q('?i wdt:P31 wd:Q1221156.') },
  { id: 'english-counties', group: 'geo', text: 'Name a county of England', ...q('?i wdt:P31 wd:Q180673.') },
  { id: 'us-cities', group: 'geo', text: 'Name a US city with more than 200,000 people', ...q('?i wdt:P31 wd:Q1093829; wdt:P1082 ?pop. FILTER(?pop > 200000)') },
  { id: 'uk-cities', group: 'geo', text: 'Name a city in the United Kingdom', ...q('?i wdt:P31 wd:Q515; wdt:P17 wd:Q145.') },
  { id: 'languages', group: 'geo', text: 'Name a language', ...q('?i wdt:P31 wd:Q34770.') },
  { id: 'sa-universities', group: 'geo', text: 'Name a South African university', ...q('?i wdt:P31/wdt:P279? wd:Q3918; wdt:P17 wd:Q258.') },
  { id: 'us-universities', group: 'geo', text: 'Name an American university', ...q('?i wdt:P31 wd:Q3918; wdt:P17 wd:Q30.') },
  // golf
  { id: 'golf-americans', group: 'golf', text: 'Name an American golfer', ...q('?i wdt:P106 wd:Q11303721; wdt:P27 wd:Q30.') },
  { id: 'golf-australians', group: 'golf', text: 'Name an Australian golfer', ...q('?i wdt:P106 wd:Q11303721; wdt:P27 wd:Q408.') },
  // sport
  { id: 'mancity-players', group: 'sport', text: 'Name a footballer who has played for Manchester City', ...q(playedFor('Q50602')) },
  { id: 'spurs-players', group: 'sport', text: 'Name a footballer who has played for Tottenham Hotspur', ...q(playedFor('Q18741')) },
  { id: 'chiefs-players', group: 'sport', text: 'Name a footballer who has played for Kaizer Chiefs', ...q(playedFor('Q247731')) },
  { id: 'pirates-players', group: 'sport', text: 'Name a footballer who has played for Orlando Pirates', ...q(playedFor('Q607939')) },
  { id: 'sundowns-players', group: 'sport', text: 'Name a footballer who has played for Mamelodi Sundowns', ...q(playedFor('Q784965')) },
  { id: 'bafana', group: 'sport', text: 'Name a footballer who has played for Bafana Bafana (South Africa)', ...q(playedFor('Q170327')) },
  { id: 'all-blacks', group: 'sport', text: 'Name an All Black (New Zealand rugby international)', ...q(playedFor('Q55801')) },
  { id: 'india-cricketers', group: 'sport', text: 'Name a cricketer who has played for India', ...q(playedFor('Q1143793')) },
  { id: 'aussie-cricketers', group: 'sport', text: 'Name a cricketer who has played for Australia', ...q(playedFor('Q142555')) },
  { id: 'basketball-players', group: 'sport', text: 'Name a basketball player', ...q(job('Q3665646')) },
  { id: 'tennis-players', group: 'sport', text: 'Name a professional tennis player', ...q(job('Q10833314')) },
  // music
  { id: 'songs-icons', group: 'music', text: 'Name a song by Elton John, Madonna or Prince', ...q(songsBy('Q2808', 'Q1744', 'Q7542')) },
  { id: 'songs-stadium', group: 'music', text: 'Name a song by Coldplay, U2 or Oasis', ...q(songsBy('Q45188', 'Q396', 'Q382890')) },
  { id: 'songs-charts', group: 'music', text: 'Name a song by Bruno Mars, Justin Bieber or The Weeknd', ...q(songsBy('Q1450', 'Q34086', 'Q2121062')) },
  { id: 'songs-legends', group: 'music', text: 'Name a song by Bob Dylan, David Bowie or Bob Marley', ...q(songsBy('Q392', 'Q5383', 'Q409')) },
  { id: 'beatles-albums', group: 'music', text: 'Name a Beatles album', ...q('?i wdt:P175 wd:Q1299; wdt:P31 wd:Q482994.') },
  { id: 'rappers', group: 'music', text: 'Name a rapper', ...q(job('Q2252262')) },
  { id: 'boy-bands', group: 'music', text: 'Name a boy band', ...q('?i wdt:P31 wd:Q216337.') },
  { id: 'jazz-musicians', group: 'music', text: 'Name a jazz musician', ...q(job('Q15981151')) },
  // film, tv and games
  { id: 'films-horror', group: 'film', text: 'Name a horror film', ...q('?i wdt:P31 wd:Q11424; wdt:P136 wd:Q200092.') },
  { id: 'films-christmas', group: 'film', text: 'Name a Christmas film', ...q('?i wdt:P31 wd:Q11424; wdt:P136 wd:Q28026639.') },
  { id: 'films-leads', group: 'film', text: 'Name a film starring Will Smith, Denzel Washington, Morgan Freeman or Samuel L. Jackson', ...q(filmsWith('wdt:P161', 'Q40096', 'Q42101', 'Q48337', 'Q172678')) },
  { id: 'chars-friends', group: 'film', text: 'Name a character from Friends', ...q('?i wdt:P1441 wd:Q79784.') },
  { id: 'sitcoms', group: 'film', text: 'Name a sitcom', ...q('?i wdt:P31 wd:Q5398426; wdt:P136 wd:Q170238.') },
  { id: 'anime', group: 'film', text: 'Name an anime series', ...q('?i wdt:P31 wd:Q63952888.') },
  { id: 'playstation-games', group: 'film', text: 'Name a PlayStation 2 or PlayStation 4 game', ...q('VALUES ?p { wd:Q10680 wd:Q5014725 } ?i wdt:P400 ?p; wdt:P31 wd:Q7889.') },
  { id: 'comedians', group: 'film', text: 'Name a comedian', ...q(job('Q245068')) },
  // books and art
  { id: 'books-kids', group: 'books', text: 'Name a book by Dr. Seuss, Enid Blyton or J. K. Rowling', ...q(booksOf('Q298685', 'Q192069', 'Q34660')) },
  { id: 'philosophers', group: 'books', text: 'Name a philosopher', ...q(job('Q4964182')) },
  { id: 'paintings', group: 'books', text: 'Name a painting by Van Gogh, Picasso or Monet', ...q('VALUES ?who { wd:Q5582 wd:Q5593 wd:Q296 } ?i wdt:P170 ?who; wdt:P31 wd:Q3305213.') },
  // history and people
  { id: 'us-vice-presidents', group: 'history', text: 'Name a US vice president', ...q(held('Q11699')) },
  { id: 'aus-pms', group: 'history', text: 'Name an Australian prime minister', ...q(held('Q319145')) },
  { id: 'canada-pms', group: 'history', text: 'Name a Canadian prime minister', ...q(held('Q839078')) },
  { id: 'french-presidents', group: 'history', text: 'Name a president of France', ...q(held('Q191954')) },
  { id: 'german-chancellors', group: 'history', text: 'Name a chancellor of Germany', ...q(held('Q4970706')) },
  { id: 'empires', group: 'history', text: 'Name an empire', ...q('?i wdt:P31 wd:Q48349.') },
  { id: 'wars', group: 'history', text: 'Name a war', ...q('?i wdt:P31 wd:Q198.') },
  { id: 'explorers', group: 'history', text: 'Name an explorer', ...q(job('Q11900058')) },
  { id: 'inventors', group: 'history', text: 'Name an inventor', ...q(job('Q205375')) },
  { id: 'mythical-creatures', group: 'history', text: 'Name a mythical creature', ...q('?i wdt:P31 wd:Q2239243.') },
  // science and work
  { id: 'physicists', group: 'science', text: 'Name a physicist', ...q(job('Q169470')) },
  { id: 'mathematicians', group: 'science', text: 'Name a mathematician', ...q(job('Q170790')) },
  { id: 'architects', group: 'science', text: 'Name an architect', ...q(job('Q42973')) },
  { id: 'chefs', group: 'science', text: 'Name a chef', ...q(job('Q3499072')) },
  // food, drink and companies
  { id: 'grapes', group: 'food', text: 'Name a grape variety', ...q('?i wdt:P31 wd:Q958314.') },
  { id: 'desserts', group: 'food', text: 'Name a dessert', ...q(kindOf('Q182940')) },
  { id: 'curries', group: 'food', text: 'Name a curry', ...q(kindOf('Q164606')) },
  { id: 'sandwiches', group: 'food', text: 'Name a sandwich', ...q(kindOf('Q28803')) },
  { id: 'sauces', group: 'food', text: 'Name a sauce', ...q(kindOf('Q178359')) },
  { id: 'soft-drinks', group: 'food', text: 'Name a soft drink', ...q(kindOf('Q147538')) },
  { id: 'sp500', group: 'food', text: 'Name a company in the S&P 500', ...q('?i wdt:P361 wd:Q242345.') },
  { id: 'ftse100', group: 'food', text: 'Name a company in the FTSE 100', ...q('?i wdt:P361 wd:Q466496.') },
];
PROMPTS.push(...EVEN_MORE_PROMPTS);

// A big batch (2026-11-16), mostly found by English name rather than id, so a wrong label simply
// builds nothing (and is skipped) instead of building the wrong list.
const BIG_BATCH = [
  { id: 'barca-players', group: 'sport', text: "Name a footballer who has played for Barcelona", ...q(`${labelled("FC Barcelona", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'juve-players', group: 'sport', text: "Name a footballer who has played for Juventus", ...q(`${labelled("Juventus FC", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'milan-players', group: 'sport', text: "Name a footballer who has played for AC Milan", ...q(`${labelled("AC Milan", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'inter-players', group: 'sport', text: "Name a footballer who has played for Inter Milan", ...q(`${labelled("Inter Milan", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'bayern-players', group: 'sport', text: "Name a footballer who has played for Bayern Munich", ...q(`${labelled("FC Bayern Munich", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'dortmund-players', group: 'sport', text: "Name a footballer who has played for Borussia Dortmund", ...q(`${labelled("Borussia Dortmund", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'psg-players', group: 'sport', text: "Name a footballer who has played for Paris Saint-Germain", ...q(`${labelled("Paris Saint-Germain FC", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'ajax-players', group: 'sport', text: "Name a footballer who has played for Ajax", ...q(`${labelled("AFC Ajax", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'celtic-players', group: 'sport', text: "Name a footballer who has played for Celtic", ...q(`${labelled("Celtic F.C.", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'rangers-players', group: 'sport', text: "Name a footballer who has played for Rangers", ...q(`${labelled("Rangers F.C.", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'everton-players', group: 'sport', text: "Name a footballer who has played for Everton", ...q(`${labelled("Everton F.C.", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'newcastle-players', group: 'sport', text: "Name a footballer who has played for Newcastle United", ...q(`${labelled("Newcastle United F.C.", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'villa-players', group: 'sport', text: "Name a footballer who has played for Aston Villa", ...q(`${labelled("Aston Villa F.C.", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'westham-players', group: 'sport', text: "Name a footballer who has played for West Ham United", ...q(`${labelled("West Ham United F.C.", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'leeds-players', group: 'sport', text: "Name a footballer who has played for Leeds United", ...q(`${labelled("Leeds United F.C.", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'benfica-players', group: 'sport', text: "Name a footballer who has played for Benfica", ...q(`${labelled("S.L. Benfica", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'boca-players', group: 'sport', text: "Name a footballer who has played for Boca Juniors", ...q(`${labelled("Boca Juniors", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'atletico-players', group: 'sport', text: "Name a footballer who has played for Atlético Madrid", ...q(`${labelled("Atlético Madrid", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'napoli-players', group: 'sport', text: "Name a footballer who has played for Napoli", ...q(`${labelled("SSC Napoli", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'brazil-players', group: 'sport', text: "Name a footballer who has played for Brazil", ...q(`${labelled(["Brazil national football team","Brazil men's national football team"], 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'argentina-players', group: 'sport', text: "Name a footballer who has played for Argentina", ...q(`${labelled(["Argentina national football team","Argentina men's national football team"], 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'spain-players', group: 'sport', text: "Name a footballer who has played for Spain", ...q(`${labelled(["Spain national football team","Spain men's national football team"], 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'portugal-players', group: 'sport', text: "Name a footballer who has played for Portugal", ...q(`${labelled(["Portugal national football team","Portugal men's national football team"], 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'usmnt-players', group: 'sport', text: "Name a footballer who has played for the USA", ...q(`${labelled("United States men's national soccer team", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'nigeria-players', group: 'sport', text: "Name a footballer who has played for Nigeria", ...q(`${labelled(["Nigeria national football team","Nigeria men's national football team"], 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'scotland-players', group: 'sport', text: "Name a footballer who has played for Scotland", ...q(`${labelled(["Scotland national football team","Scotland men's national football team"], 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'wallabies', group: 'sport', text: "Name a Wallaby (Australia rugby international)", ...q(`${labelled("Australia national rugby union team", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'wales-rugby', group: 'sport', text: "Name a rugby player who has played for Wales", ...q(`${labelled("Wales national rugby union team", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'france-rugby', group: 'sport', text: "Name a rugby player who has played for France", ...q(`${labelled("France national rugby union team", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'england-cricketers', group: 'sport', text: "Name a cricketer who has played for England", ...q(`${labelled("England cricket team", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'pakistan-cricketers', group: 'sport', text: "Name a cricketer who has played for Pakistan", ...q(`${labelled("Pakistan national cricket team", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'nz-cricketers', group: 'sport', text: "Name a cricketer who has played for New Zealand", ...q(`${labelled("New Zealand national cricket team", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'windies-cricketers', group: 'sport', text: "Name a cricketer who has played for the West Indies", ...q(`${labelled("West Indies cricket team", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'srilanka-cricketers', group: 'sport', text: "Name a cricketer who has played for Sri Lanka", ...q(`${labelled("Sri Lanka national cricket team", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'warriors-players', group: 'sport', text: "Name a basketball player who has played for the Golden State Warriors", ...q(`${labelled("Golden State Warriors", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'heat-players', group: 'sport', text: "Name a basketball player who has played for the Miami Heat", ...q(`${labelled("Miami Heat", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'knicks-players', group: 'sport', text: "Name a basketball player who has played for the New York Knicks", ...q(`${labelled("New York Knicks", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'cowboys-players', group: 'sport', text: "Name an American football player who has played for the Dallas Cowboys", ...q(`${labelled("Dallas Cowboys", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'patriots-players', group: 'sport', text: "Name an American football player who has played for the New England Patriots", ...q(`${labelled("New England Patriots", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'yankees-players', group: 'sport', text: "Name a baseball player who has played for the New York Yankees", ...q(`${labelled("New York Yankees", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'dodgers-players', group: 'sport', text: "Name a baseball player who has played for the Los Angeles Dodgers", ...q(`${labelled("Los Angeles Dodgers", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'ferrari-drivers', group: 'sport', text: "Name a Formula One driver who has driven for Ferrari", ...q(`${labelled("Scuderia Ferrari", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'mclaren-drivers', group: 'sport', text: "Name a Formula One driver who has driven for McLaren", ...q(`${labelled("McLaren", 'wdt:P54')} ?i wdt:P31 wd:Q5.`) },
  { id: 'snooker-players', group: 'sport', text: "Name a snooker player", ...q(`${labelled(["snooker player"], 'wdt:P106')} ?i wdt:P31 wd:Q5. ${WELL_KNOWN}`) },
  { id: 'darts-players', group: 'sport', text: "Name a darts player", ...q(`${labelled(["darts player"], 'wdt:P106')} ?i wdt:P31 wd:Q5. ${WELL_KNOWN}`) },
  { id: 'cyclists', group: 'sport', text: "Name a racing cyclist", ...q(`${labelled(["racing cyclist","sport cyclist"], 'wdt:P106')} ?i wdt:P31 wd:Q5. ${WELL_KNOWN}`) },
  { id: 'playwrights', group: 'books', text: "Name a playwright", ...q(`${labelled(["playwright"], 'wdt:P106')} ?i wdt:P31 wd:Q5. ${WELL_KNOWN}`) },
  { id: 'sculptors', group: 'books', text: "Name a sculptor", ...q(`${labelled(["sculptor"], 'wdt:P106')} ?i wdt:P31 wd:Q5. ${WELL_KNOWN}`) },
  { id: 'magicians', group: 'film', text: "Name a magician", ...q(`${labelled(["magician"], 'wdt:P106')} ?i wdt:P31 wd:Q5. ${WELL_KNOWN}`) },
  { id: 'pianists', group: 'music', text: "Name a pianist", ...q(`${labelled(["pianist"], 'wdt:P106')} ?i wdt:P31 wd:Q5. ${WELL_KNOWN}`) },
  { id: 'astronomers', group: 'science', text: "Name an astronomer", ...q(`${labelled(["astronomer"], 'wdt:P106')} ?i wdt:P31 wd:Q5. ${WELL_KNOWN}`) },
  { id: 'chemists', group: 'science', text: "Name a chemist", ...q(`${labelled(["chemist"], 'wdt:P106')} ?i wdt:P31 wd:Q5. ${WELL_KNOWN}`) },
  { id: 'biologists', group: 'science', text: "Name a biologist", ...q(`${labelled(["biologist"], 'wdt:P106')} ?i wdt:P31 wd:Q5. ${WELL_KNOWN}`) },
  { id: 'economists', group: 'science', text: "Name an economist", ...q(`${labelled(["economist"], 'wdt:P106')} ?i wdt:P31 wd:Q5. ${WELL_KNOWN}`) },
  { id: 'entrepreneurs', group: 'food', text: "Name an entrepreneur", ...q(`${labelled(["entrepreneur","business magnate"], 'wdt:P106')} ?i wdt:P31 wd:Q5. ${WELL_KNOWN}`) },
  { id: 'songs-floyd', group: 'music', text: "Name a song by Pink Floyd, Led Zeppelin or The Who", ...q(`${labelled(["Pink Floyd","Led Zeppelin","The Who"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-grunge', group: 'music', text: "Name a song by Nirvana, Foo Fighters or Red Hot Chili Peppers", ...q(`${labelled(["Nirvana","Foo Fighters","Red Hot Chili Peppers"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-gen-z', group: 'music', text: "Name a song by Billie Eilish, Olivia Rodrigo or Dua Lipa", ...q(`${labelled(["Billie Eilish","Olivia Rodrigo","Dua Lipa"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-hiphop', group: 'music', text: "Name a song by Kendrick Lamar, Travis Scott or Jay-Z", ...q(`${labelled(["Kendrick Lamar","Travis Scott","Jay-Z"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-voices', group: 'music', text: "Name a song by Whitney Houston, Mariah Carey or Celine Dion", ...q(`${labelled(["Whitney Houston","Mariah Carey","Celine Dion"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-motown', group: 'music', text: "Name a song by Stevie Wonder, Marvin Gaye or Aretha Franklin", ...q(`${labelled(["Stevie Wonder","Marvin Gaye","Aretha Franklin"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-70s', group: 'music', text: "Name a song by Bee Gees, Fleetwood Mac or Eagles", ...q(`${labelled(["Bee Gees","Fleetwood Mac","Eagles"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-rock', group: 'music', text: "Name a song by AC/DC, Metallica or Guns N' Roses", ...q(`${labelled(["AC/DC","Metallica","Guns N' Roses"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-indie', group: 'music', text: "Name a song by Arctic Monkeys, Radiohead or Blur", ...q(`${labelled(["Arctic Monkeys","Radiohead","Blur"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-bands', group: 'music', text: "Name a song by One Direction, Little Mix or Spice Girls", ...q(`${labelled(["One Direction","Little Mix","Spice Girls"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-latin', group: 'music', text: "Name a song by Shakira, Bad Bunny or Daddy Yankee", ...q(`${labelled(["Shakira","Bad Bunny","Daddy Yankee"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-crooners', group: 'music', text: "Name a song by Frank Sinatra, Dean Martin or Nat King Cole", ...q(`${labelled(["Frank Sinatra","Dean Martin","Nat King Cole"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-country', group: 'music', text: "Name a song by Johnny Cash, Dolly Parton or Garth Brooks", ...q(`${labelled(["Johnny Cash","Dolly Parton","Garth Brooks"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-punk', group: 'music', text: "Name a song by Green Day, Linkin Park or Blink-182", ...q(`${labelled(["Green Day","Linkin Park","Blink-182"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-heartland', group: 'music', text: "Name a song by Bruce Springsteen, Bon Jovi or Tom Petty", ...q(`${labelled(["Bruce Springsteen","Bon Jovi","Tom Petty"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-pop-queens', group: 'music', text: "Name a song by Katy Perry, Ariana Grande or Kylie Minogue", ...q(`${labelled(["Katy Perry","Ariana Grande","Kylie Minogue"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-sabrina', group: 'music', text: "Name a song by Sabrina Carpenter, Olivia Rodrigo or Harry Styles", ...q(`${labelled(["Sabrina Carpenter","Olivia Rodrigo","Harry Styles"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'songs-80s', group: 'music', text: "Name a song by Duran Duran, Depeche Mode or Tears for Fears", ...q(`${labelled(["Duran Duran","Depeche Mode","Tears for Fears"], 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q7366 wd:Q134556 wd:Q105543609 }`) },
  { id: 'albums-swift', group: 'music', text: "Name an album by Taylor Swift", ...q(`${labelled("Taylor Swift", 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q482994 wd:Q208569 }`) },
  { id: 'albums-queen', group: 'music', text: "Name an album by Queen", ...q(`${labelled("Queen", 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q482994 wd:Q208569 }`) },
  { id: 'albums-bowie', group: 'music', text: "Name an album by David Bowie", ...q(`${labelled("David Bowie", 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q482994 wd:Q208569 }`) },
  { id: 'albums-mj', group: 'music', text: "Name an album by Michael Jackson", ...q(`${labelled("Michael Jackson", 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q482994 wd:Q208569 }`) },
  { id: 'albums-stones', group: 'music', text: "Name an album by The Rolling Stones", ...q(`${labelled("The Rolling Stones", 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q482994 wd:Q208569 }`) },
  { id: 'albums-dylan', group: 'music', text: "Name an album by Bob Dylan", ...q(`${labelled("Bob Dylan", 'wdt:P175')} ?i wdt:P31 ?kind. VALUES ?kind { wd:Q482994 wd:Q208569 }`) },
  { id: 'films-comedy-stars', group: 'film', text: "Name a film starring Jim Carrey, Adam Sandler or Ben Stiller", ...q(`${labelled(["Jim Carrey","Adam Sandler","Ben Stiller"], 'wdt:P161')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-action-stars', group: 'film', text: "Name a film starring Arnold Schwarzenegger, Sylvester Stallone or Bruce Willis", ...q(`${labelled(["Arnold Schwarzenegger","Sylvester Stallone","Bruce Willis"], 'wdt:P161')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-leading-ladies', group: 'film', text: "Name a film starring Meryl Streep, Julia Roberts or Sandra Bullock", ...q(`${labelled(["Meryl Streep","Julia Roberts","Sandra Bullock"], 'wdt:P161')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-depp-reeves', group: 'film', text: "Name a film starring Johnny Depp, Keanu Reeves or Nicolas Cage", ...q(`${labelled(["Johnny Depp","Keanu Reeves","Nicolas Cage"], 'wdt:P161')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-de-niro', group: 'film', text: "Name a film starring Robert De Niro, Al Pacino or Jack Nicholson", ...q(`${labelled(["Robert De Niro","Al Pacino","Jack Nicholson"], 'wdt:P161')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-bollywood', group: 'film', text: "Name a film starring Shah Rukh Khan, Amitabh Bachchan or Aamir Khan", ...q(`${labelled(["Shah Rukh Khan","Amitabh Bachchan","Aamir Khan"], 'wdt:P161')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-jackie-chan', group: 'film', text: "Name a film starring Jackie Chan, Jet Li or Bruce Lee", ...q(`${labelled(["Jackie Chan","Jet Li","Bruce Lee"], 'wdt:P161')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-scarlett', group: 'film', text: "Name a film starring Scarlett Johansson, Jennifer Lawrence or Natalie Portman", ...q(`${labelled(["Scarlett Johansson","Jennifer Lawrence","Natalie Portman"], 'wdt:P161')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-damon', group: 'film', text: "Name a film starring Matt Damon, Ben Affleck or George Clooney", ...q(`${labelled(["Matt Damon","Ben Affleck","George Clooney"], 'wdt:P161')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-marvel-cast', group: 'film', text: "Name a film starring Robert Downey Jr., Chris Hemsworth or Chris Evans", ...q(`${labelled(["Robert Downey Jr.","Chris Hemsworth","Chris Evans"], 'wdt:P161')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-burton', group: 'film', text: "Name a film directed by Tim Burton, Wes Anderson or Guillermo del Toro", ...q(`${labelled(["Tim Burton","Wes Anderson","Guillermo del Toro"], 'wdt:P57')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-jackson', group: 'film', text: "Name a film directed by Peter Jackson, Ridley Scott or Denis Villeneuve", ...q(`${labelled(["Peter Jackson","Ridley Scott","Denis Villeneuve"], 'wdt:P57')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-coppola', group: 'film', text: "Name a film directed by Francis Ford Coppola, Steven Soderbergh or David Fincher", ...q(`${labelled(["Francis Ford Coppola","Steven Soderbergh","David Fincher"], 'wdt:P57')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-eastwood', group: 'film', text: "Name a film directed by Clint Eastwood, Ron Howard or Robert Zemeckis", ...q(`${labelled(["Clint Eastwood","Ron Howard","Robert Zemeckis"], 'wdt:P57')} ?i wdt:P31 wd:Q11424.`) },
  { id: 'films-scifi', group: 'film', text: "Name a science fiction film", ...q('?i wdt:P31 wd:Q11424; wdt:P136 wd:Q471839. ?i wikibase:sitelinks ?sl. FILTER(?sl >= 15)') },
  { id: 'films-war', group: 'film', text: "Name a war film", ...q('?i wdt:P31 wd:Q11424; wdt:P136 wd:Q369747. ?i wikibase:sitelinks ?sl. FILTER(?sl >= 12)') },
  { id: 'films-musical', group: 'film', text: "Name a musical film", ...q('?i wdt:P31 wd:Q11424; wdt:P136 wd:Q842256. ?i wikibase:sitelinks ?sl. FILTER(?sl >= 10)') },
  { id: 'chars-office', group: 'film', text: "Name a character from The Office (US)", ...q(`${labelled("The Office", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-breaking-bad', group: 'film', text: "Name a character from Breaking Bad", ...q(`${labelled("Breaking Bad", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-lotr', group: 'film', text: "Name a character from The Lord of the Rings", ...q(`${labelled("The Lord of the Rings", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-doctor-who', group: 'film', text: "Name a character from Doctor Who", ...q(`${labelled("Doctor Who", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-family-guy', group: 'film', text: "Name a character from Family Guy", ...q(`${labelled("Family Guy", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-south-park', group: 'film', text: "Name a character from South Park", ...q(`${labelled("South Park", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-spongebob', group: 'film', text: "Name a character from SpongeBob SquarePants", ...q(`${labelled("SpongeBob SquarePants", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-stranger-things', group: 'film', text: "Name a character from Stranger Things", ...q(`${labelled("Stranger Things", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-sopranos', group: 'film', text: "Name a character from The Sopranos", ...q(`${labelled("The Sopranos", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-naruto', group: 'film', text: "Name a character from Naruto", ...q(`${labelled("Naruto", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-one-piece', group: 'film', text: "Name a character from One Piece", ...q(`${labelled("One Piece", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-greys', group: 'film', text: "Name a character from Grey's Anatomy", ...q(`${labelled("Grey's Anatomy", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-star-trek', group: 'film', text: "Name a Star Trek character", ...q(`${labelled("Star Trek", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'chars-dragon-ball', group: 'film', text: "Name a Dragon Ball character", ...q(`${labelled("Dragon Ball", 'wdt:P1441')} ?i wdt:P31/wdt:P279? ?ck. VALUES ?ck { wd:Q15773347 wd:Q95074 wd:Q15632617 wd:Q15773317 wd:Q3658341 wd:Q20085850 wd:Q80447738 wd:Q15711870 }`) },
  { id: 'shows-disney-channel', group: 'film', text: "Name a Disney Channel show", ...q(`${labelled("Disney Channel", 'wdt:P449')} ?i wdt:P31/wdt:P279? wd:Q5398426.`) },
  { id: 'shows-nickelodeon', group: 'film', text: "Name a Nickelodeon show", ...q(`${labelled("Nickelodeon", 'wdt:P449')} ?i wdt:P31/wdt:P279? wd:Q5398426.`) },
  { id: 'shows-cartoon-network', group: 'film', text: "Name a Cartoon Network show", ...q(`${labelled("Cartoon Network", 'wdt:P449')} ?i wdt:P31/wdt:P279? wd:Q5398426.`) },
  { id: 'shows-bbc-one', group: 'film', text: "Name a BBC One show", ...q(`${labelled("BBC One", 'wdt:P449')} ?i wdt:P31/wdt:P279? wd:Q5398426.`) },
  { id: 'shows-itv', group: 'film', text: "Name an ITV show", ...q(`${labelled("ITV", 'wdt:P449')} ?i wdt:P31/wdt:P279? wd:Q5398426.`) },
  { id: 'shows-channel-4', group: 'film', text: "Name a Channel 4 show", ...q(`${labelled("Channel 4", 'wdt:P449')} ?i wdt:P31/wdt:P279? wd:Q5398426.`) },
  { id: 'shows-nbc', group: 'film', text: "Name an NBC show", ...q(`${labelled("NBC", 'wdt:P449')} ?i wdt:P31/wdt:P279? wd:Q5398426.`) },
  { id: 'shows-cbs', group: 'film', text: "Name a CBS show", ...q(`${labelled("CBS", 'wdt:P449')} ?i wdt:P31/wdt:P279? wd:Q5398426.`) },
  { id: 'shows-fox', group: 'film', text: "Name a Fox show", ...q(`${labelled("Fox Broadcasting Company", 'wdt:P449')} ?i wdt:P31/wdt:P279? wd:Q5398426.`) },
  { id: 'shows-abc', group: 'film', text: "Name an ABC (US) show", ...q(`${labelled("American Broadcasting Company", 'wdt:P449')} ?i wdt:P31/wdt:P279? wd:Q5398426.`) },
  { id: 'shows-mtv', group: 'film', text: "Name an MTV show", ...q(`${labelled("MTV", 'wdt:P449')} ?i wdt:P31/wdt:P279? wd:Q5398426.`) },
  { id: 'games-switch', group: 'film', text: "Name a Nintendo Switch game", ...q(`${labelled("Nintendo Switch", 'wdt:P400')} ?i wdt:P31 wd:Q7889.`) },
  { id: 'games-wii', group: 'film', text: "Name a Wii game", ...q(`${labelled("Wii", 'wdt:P400')} ?i wdt:P31 wd:Q7889.`) },
  { id: 'games-xbox360', group: 'film', text: "Name an Xbox 360 game", ...q(`${labelled("Xbox 360", 'wdt:P400')} ?i wdt:P31 wd:Q7889.`) },
  { id: 'games-ps1', group: 'film', text: "Name a game for the original PlayStation", ...q(`${labelled("PlayStation", 'wdt:P400')} ?i wdt:P31 wd:Q7889.`) },
  { id: 'games-gameboy', group: 'film', text: "Name a Game Boy game", ...q(`${labelled("Game Boy", 'wdt:P400')} ?i wdt:P31 wd:Q7889.`) },
  { id: 'games-n64', group: 'film', text: "Name a Nintendo 64 game", ...q(`${labelled("Nintendo 64", 'wdt:P400')} ?i wdt:P31 wd:Q7889.`) },
  { id: 'games-snes', group: 'film', text: "Name a Super Nintendo game", ...q(`${labelled("Super Nintendo Entertainment System", 'wdt:P400')} ?i wdt:P31 wd:Q7889.`) },
  { id: 'games-ps5', group: 'film', text: "Name a PlayStation 5 game", ...q(`${labelled("PlayStation 5", 'wdt:P400')} ?i wdt:P31 wd:Q7889.`) },
  { id: 'books-dystopia', group: 'books', text: "Name a book by George Orwell, Aldous Huxley or Ray Bradbury", ...q(`${labelled(["George Orwell","Aldous Huxley","Ray Bradbury"], 'wdt:P50')} ?i wdt:P31 ?kind. ${BOOK_KINDS}`) },
  { id: 'books-americans', group: 'books', text: "Name a book by Ernest Hemingway, F. Scott Fitzgerald or John Steinbeck", ...q(`${labelled(["Ernest Hemingway","F. Scott Fitzgerald","John Steinbeck"], 'wdt:P50')} ?i wdt:P31 ?kind. ${BOOK_KINDS}`) },
  { id: 'books-thrills', group: 'books', text: "Name a book by Dan Brown, John Grisham or Lee Child", ...q(`${labelled(["Dan Brown","John Grisham","Lee Child"], 'wdt:P50')} ?i wdt:P31 ?kind. ${BOOK_KINDS}`) },
  { id: 'books-fantasy', group: 'books', text: "Name a book by Terry Pratchett, Neil Gaiman or George R. R. Martin", ...q(`${labelled(["Terry Pratchett","Neil Gaiman","George R. R. Martin"], 'wdt:P50')} ?i wdt:P31 ?kind. ${BOOK_KINDS}`) },
  { id: 'books-twain', group: 'books', text: "Name a book by Mark Twain, Charles Dickens or Leo Tolstoy", ...q(`${labelled(["Mark Twain","Charles Dickens","Leo Tolstoy"], 'wdt:P50')} ?i wdt:P31 ?kind. ${BOOK_KINDS}`) },
  { id: 'books-brontes', group: 'books', text: "Name a book by Charlotte Brontë, Emily Brontë or Virginia Woolf", ...q(`${labelled(["Charlotte Brontë","Emily Brontë","Virginia Woolf"], 'wdt:P50')} ?i wdt:P31 ?kind. ${BOOK_KINDS}`) },
  { id: 'books-ya', group: 'books', text: "Name a book by Suzanne Collins, Rick Riordan or John Green", ...q(`${labelled(["Suzanne Collins","Rick Riordan","John Green"], 'wdt:P50')} ?i wdt:P31 ?kind. ${BOOK_KINDS}`) },
  { id: 'books-sci-fi', group: 'books', text: "Name a book by Isaac Asimov, Arthur C. Clarke or Philip K. Dick", ...q(`${labelled(["Isaac Asimov","Arthur C. Clarke","Philip K. Dick"], 'wdt:P50')} ?i wdt:P31 ?kind. ${BOOK_KINDS}`) },
  { id: 'booker-winners', group: 'books', text: "Name a Booker Prize-winning novel or author", ...q(`${labelled('Booker Prize', 'wdt:P166')}`) },
  { id: 'best-director', group: 'film', text: "Name a winner of the Oscar for Best Director", ...q(`${labelled("Academy Award for Best Director", 'wdt:P166')} ?i wdt:P31 wd:Q5.`) },
  { id: 'supporting-oscar', group: 'film', text: "Name a winner of a supporting acting Oscar", ...q(`${labelled(["Academy Award for Best Supporting Actor","Academy Award for Best Supporting Actress"], 'wdt:P166')} ?i wdt:P31 wd:Q5.`) },
  { id: 'grammy-new-artist', group: 'music', text: "Name a winner of the Grammy for Best New Artist", ...q(`${labelled("Grammy Award for Best New Artist", 'wdt:P166')}`) },
  { id: 'grammy-album', group: 'music', text: "Name an album that won the Grammy for Album of the Year", ...q(`${labelled("Grammy Award for Album of the Year", 'wdt:P166')}`) },
  { id: 'nba-mvps', group: 'sport', text: "Name an NBA MVP", ...q(`${labelled("NBA Most Valuable Player Award", 'wdt:P166')} ?i wdt:P31 wd:Q5.`) },
  { id: 'heisman', group: 'sport', text: "Name a Heisman Trophy winner", ...q(`${labelled("Heisman Trophy", 'wdt:P166')} ?i wdt:P31 wd:Q5.`) },
  { id: 'spoty', group: 'sport', text: "Name a BBC Sports Personality of the Year", ...q(`${labelled("BBC Sports Personality of the Year Award", 'wdt:P166')} ?i wdt:P31 wd:Q5.`) },
  { id: 'nobel-medicine', group: 'science', text: "Name a winner of the Nobel Prize in Medicine", ...q(`${labelled("Nobel Prize in Physiology or Medicine", 'wdt:P166')} ?i wdt:P31 wd:Q5.`) },
  { id: 'first-ladies', group: 'history', text: "Name a US First Lady", ...q(`${labelled("First Lady of the United States", 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'secretaries-of-state', group: 'history', text: "Name a US Secretary of State", ...q(`${labelled("United States Secretary of State", 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'chancellors-exchequer', group: 'history', text: "Name a Chancellor of the Exchequer", ...q(`${labelled("Chancellor of the Exchequer", 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'india-pms', group: 'history', text: "Name an Indian prime minister", ...q(`${labelled("Prime Minister of India", 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'japan-pms', group: 'history', text: "Name a Japanese prime minister", ...q(`${labelled("Prime Minister of Japan", 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'holy-roman-emperors', group: 'history', text: "Name a Holy Roman Emperor", ...q(`${labelled("Holy Roman Emperor", 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'byzantine-emperors', group: 'history', text: "Name a Byzantine emperor", ...q(`${labelled("Byzantine emperor", 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'pharaohs', group: 'history', text: "Name a pharaoh", ...q(`${labelled("pharaoh", 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'kings-of-france', group: 'history', text: "Name a king of France", ...q(`${labelled("King of France", 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'chinese-emperors', group: 'history', text: "Name a Chinese emperor", ...q(`${labelled("Emperor of China", 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'us-chief-justices', group: 'history', text: "Name a US Chief Justice", ...q(`${labelled("Chief Justice of the United States", 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'nz-pms', group: 'history', text: "Name a New Zealand prime minister", ...q(`${labelled("Prime Minister of New Zealand", 'wdt:P39')} ?i wdt:P31 wd:Q5.`) },
  { id: 'hindu-gods', group: 'history', text: "Name a Hindu god or goddess", ...q(`${labelled(['Hindu deity', 'Hindu god', 'Hindu goddess'])}`) },
  { id: 'ww1-battles', group: 'history', text: "Name a battle of the First World War", ...q('?i wdt:P31 wd:Q178561; wdt:P361 wd:Q361.') },
  { id: 'revolutions', group: 'history', text: "Name a revolution", ...q(`?i wdt:P31 wd:Q10931. ${WELL_KNOWN}`) },
  { id: 'dynasties', group: 'history', text: "Name a royal dynasty", ...q(`?i wdt:P31 wd:Q164950. ${WELL_KNOWN}`) },
  { id: 'cities-germany', group: 'geo', text: "Name a city in Germany", ...q('VALUES ?k { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 } ?i wdt:P31 ?k; wdt:P17 wd:Q183; wdt:P1082 ?pop. FILTER(?pop > 150000)') },
  { id: 'cities-france', group: 'geo', text: "Name a city in France", ...q('VALUES ?k { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 } ?i wdt:P31 ?k; wdt:P17 wd:Q142; wdt:P1082 ?pop. FILTER(?pop > 100000)') },
  { id: 'cities-italy', group: 'geo', text: "Name a city in Italy", ...q('VALUES ?k { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 } ?i wdt:P31 ?k; wdt:P17 wd:Q38; wdt:P1082 ?pop. FILTER(?pop > 100000)') },
  { id: 'cities-spain', group: 'geo', text: "Name a city in Spain", ...q('VALUES ?k { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 } ?i wdt:P31 ?k; wdt:P17 wd:Q29; wdt:P1082 ?pop. FILTER(?pop > 150000)') },
  { id: 'cities-japan', group: 'geo', text: "Name a city in Japan", ...q('VALUES ?k { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 } ?i wdt:P31 ?k; wdt:P17 wd:Q17; wdt:P1082 ?pop. FILTER(?pop > 300000)') },
  { id: 'cities-china', group: 'geo', text: "Name a city in China", ...q('VALUES ?k { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 } ?i wdt:P31 ?k; wdt:P17 wd:Q148; wdt:P1082 ?pop. FILTER(?pop > 2000000)') },
  { id: 'cities-india', group: 'geo', text: "Name a city in India", ...q('VALUES ?k { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 } ?i wdt:P31 ?k; wdt:P17 wd:Q668; wdt:P1082 ?pop. FILTER(?pop > 1000000)') },
  { id: 'cities-brazil', group: 'geo', text: "Name a city in Brazil", ...q('VALUES ?k { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 } ?i wdt:P31 ?k; wdt:P17 wd:Q155; wdt:P1082 ?pop. FILTER(?pop > 500000)') },
  { id: 'cities-australia', group: 'geo', text: "Name a city in Australia", ...q('VALUES ?k { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 } ?i wdt:P31 ?k; wdt:P17 wd:Q408; wdt:P1082 ?pop. FILTER(?pop > 50000)') },
  { id: 'cities-canada', group: 'geo', text: "Name a city in Canada", ...q('VALUES ?k { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 } ?i wdt:P31 ?k; wdt:P17 wd:Q16; wdt:P1082 ?pop. FILTER(?pop > 100000)') },
  { id: 'cities-mexico', group: 'geo', text: "Name a city in Mexico", ...q('VALUES ?k { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 } ?i wdt:P31 ?k; wdt:P17 wd:Q96; wdt:P1082 ?pop. FILTER(?pop > 500000)') },
  { id: 'cities-russia', group: 'geo', text: "Name a city in Russia", ...q('VALUES ?k { wd:Q515 wd:Q1549591 wd:Q1637706 wd:Q200250 } ?i wdt:P31 ?k; wdt:P17 wd:Q159; wdt:P1082 ?pop. FILTER(?pop > 500000)') },
  { id: 'canada-provinces', group: 'geo', text: "Name a Canadian province", ...q(`?i wdt:P31 wd:Q11828004. ${WELL_KNOWN}`) },
  { id: 'brazil-states', group: 'geo', text: "Name a state of Brazil", ...q(`?i wdt:P31 wd:Q485258. ${WELL_KNOWN}`) },
  { id: 'swiss-cantons', group: 'geo', text: "Name a Swiss canton", ...q(`?i wdt:P31 wd:Q23058. ${WELL_KNOWN}`) },
  { id: 'italy-regions', group: 'geo', text: "Name a region of Italy", ...q(`?i wdt:P31 wd:Q16110. ${WELL_KNOWN}`) },
  { id: 'london-boroughs', group: 'geo', text: "Name a London borough", ...q(`?i wdt:P31 wd:Q211690. ${WELL_KNOWN}`) },
  { id: 'mountain-ranges', group: 'geo', text: "Name a mountain range", ...q(`?i wdt:P31 wd:Q46831. ${WELL_KNOWN}`) },
  { id: 'cathedrals', group: 'geo', text: "Name a cathedral", ...q(`?i wdt:P31 wd:Q2977. ${WELL_KNOWN}`) },
  { id: 'palaces', group: 'geo', text: "Name a palace", ...q(`?i wdt:P31 wd:Q16560. ${WELL_KNOWN}`) },
  { id: 'canals', group: 'geo', text: "Name a canal", ...q(`?i wdt:P31 wd:Q12284. ${WELL_KNOWN}`) },
  { id: 'comets', group: 'science', text: "Name a comet", ...q(`?i wdt:P31 wd:Q3559. ${WELL_KNOWN}`) },
  { id: 'space-probes', group: 'science', text: "Name a space probe", ...q(`?i wdt:P31 wd:Q26529. ${WELL_KNOWN}`) },
  { id: 'minerals', group: 'science', text: "Name a mineral", ...q(`?i wdt:P31 wd:Q12089225. ${WELL_KNOWN}`) },
  { id: 'banks', group: 'food', text: "Name a bank", ...q(`?i wdt:P31 wd:Q22687. ${WELL_KNOWN}`) },
  { id: 'newspapers', group: 'food', text: "Name a newspaper", ...q(`?i wdt:P31 wd:Q11032. ${WELL_KNOWN}`) },
  { id: 'magazines', group: 'food', text: "Name a magazine", ...q(`?i wdt:P31 wd:Q41298. ${WELL_KNOWN}`) },
  { id: 'cryptocurrencies', group: 'science', text: "Name a cryptocurrency", ...q(`?i wdt:P31 wd:Q13479982. ${WELL_KNOWN}`) },
  { id: 'us-national-parks', group: 'geo', text: "Name a US national park", ...q('?i wdt:P31 wd:Q34918903.') },
  { id: 'borders-china-russia', group: 'geo', text: "Name a country that borders China or Russia", ...q(`${COUNTRY} VALUES ?nb { wd:Q148 wd:Q159 } ?i wdt:P47 ?nb.`) },
  { id: 'borders-brazil-france', group: 'geo', text: "Name a country that borders Brazil, France or Germany", ...q(`${COUNTRY} VALUES ?nb { wd:Q155 wd:Q142 wd:Q183 } ?i wdt:P47 ?nb.`) },
  { id: 'capitals-asia', group: 'geo', text: "Name an Asian capital city", ...q('?c wdt:P31 wd:Q3624078; wdt:P30 wd:Q48; wdt:P36 ?i. FILTER NOT EXISTS { ?c wdt:P576 [] }') },
  { id: 'capitals-americas', group: 'geo', text: "Name a capital city in the Americas", ...q('?c wdt:P31 wd:Q3624078; wdt:P36 ?i. VALUES ?ct { wd:Q49 wd:Q18 } ?c wdt:P30 ?ct. FILTER NOT EXISTS { ?c wdt:P576 [] }') },
  { id: 'countries-start-b', group: 'geo', text: "Name a country that starts with B", ...q(COUNTRY), keep: (n) => letters(n)[0] === 'b' },
  { id: 'countries-start-c', group: 'geo', text: "Name a country that starts with C", ...q(COUNTRY), keep: (n) => letters(n)[0] === 'c' },
  { id: 'countries-start-g', group: 'geo', text: "Name a country that starts with G", ...q(COUNTRY), keep: (n) => letters(n)[0] === 'g' },
  { id: 'countries-start-n', group: 'geo', text: "Name a country that starts with N", ...q(COUNTRY), keep: (n) => letters(n)[0] === 'n' },
  { id: 'countries-start-p', group: 'geo', text: "Name a country that starts with P", ...q(COUNTRY), keep: (n) => letters(n)[0] === 'p' },
  { id: 'countries-start-t', group: 'geo', text: "Name a country that starts with T", ...q(COUNTRY), keep: (n) => letters(n)[0] === 't' },
  { id: 'countries-end-a', group: 'geo', text: "Name a country whose name ends in A", ...q(COUNTRY), keep: (n) => /a$/.test(letters(n)) },
  { id: 'golf-europeans', group: 'golf', text: "Name a golfer from Spain, Sweden, Germany or Italy", ...q('VALUES ?c { wd:Q29 wd:Q34 wd:Q183 wd:Q38 } ?i wdt:P106 wd:Q11303721; wdt:P27 ?c.') },
  { id: 'golf-asia', group: 'golf', text: "Name a golfer from Japan, South Korea or China", ...q('VALUES ?c { wd:Q17 wd:Q884 wd:Q148 } ?i wdt:P106 wd:Q11303721; wdt:P27 ?c.') },
  { id: 'golf-southern', group: 'golf', text: "Name a golfer from Argentina, Zimbabwe, Fiji or New Zealand", ...q('VALUES ?c { wd:Q414 wd:Q954 wd:Q712 wd:Q664 } ?i wdt:P106 wd:Q11303721; wdt:P27 ?c.') },
  { id: 'golf-scotland', group: 'golf', text: "Name a golf course in Scotland", ...q('?i wdt:P31 wd:Q1048525; wdt:P131* wd:Q22.') },
  { id: 'chicken-breeds', group: 'science', text: "Name a breed of chicken", ...q(`${labelled("chicken breed", 'wdt:P31|wdt:P279')}`) },
  { id: 'cattle-breeds', group: 'science', text: "Name a breed of cattle", ...q(`${labelled("cattle breed", 'wdt:P31|wdt:P279')}`) },
  { id: 'sheep-breeds', group: 'science', text: "Name a breed of sheep", ...q(`${labelled("sheep breed", 'wdt:P31|wdt:P279')}`) },
  { id: 'pig-breeds', group: 'science', text: "Name a breed of pig", ...q(`${labelled("pig breed", 'wdt:P31|wdt:P279')}`) },
  { id: 'rabbit-breeds', group: 'science', text: "Name a breed of rabbit", ...q(`${labelled("rabbit breed", 'wdt:P31|wdt:P279')}`) },
  { id: 'apples', group: 'science', text: "Name a variety of apple", ...q(`${labelled("apple cultivar", 'wdt:P31|wdt:P279')}`) },
  { id: 'gemstones', group: 'science', text: "Name a gemstone", ...q(`${labelled("gemstone", 'wdt:P31|wdt:P279')}`) },
  { id: 'cakes', group: 'food', text: "Name a cake", ...q(`${labelled("cake", 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'biscuits', group: 'food', text: "Name a biscuit or cookie", ...q(`${labelled(["biscuit","cookie"], 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'pastries', group: 'food', text: "Name a pastry", ...q(`${labelled("pastry", 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'noodles', group: 'food', text: "Name a noodle dish or type of noodle", ...q(`${labelled("noodle", 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'dumplings', group: 'food', text: "Name a dumpling", ...q(`${labelled("dumpling", 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'salads', group: 'food', text: "Name a salad", ...q(`${labelled("salad", 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'stews', group: 'food', text: "Name a stew", ...q(`${labelled("stew", 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'pies', group: 'food', text: "Name a pie", ...q(`${labelled("pie", 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'beer-styles', group: 'food', text: "Name a style of beer", ...q(`${labelled("beer style", 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'liqueurs', group: 'food', text: "Name a spirit or liqueur", ...q(`${labelled(["liqueur","distilled beverage"], 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'coffee-drinks', group: 'food', text: "Name a coffee drink", ...q(`${labelled("coffee drink", 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'cereals', group: 'food', text: "Name a breakfast cereal", ...q(`${labelled(["breakfast cereal","cereal brand"], 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'fruits', group: 'food', text: "Name a fruit", ...q(`${labelled("fruit", 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'vegetables', group: 'food', text: "Name a vegetable", ...q(`${labelled("vegetable", 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'supermarkets', group: 'food', text: "Name a supermarket chain", ...q(`${labelled(["supermarket chain","supermarket"], 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'restaurant-chains', group: 'food', text: "Name a restaurant chain", ...q(`${labelled("restaurant chain", 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'clothing-brands', group: 'food', text: "Name a clothing brand", ...q(`${labelled(["clothing brand","fashion brand","fashion label"], 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'social-networks', group: 'food', text: "Name a social network", ...q(`${labelled(["social networking service","online social network"], 'wdt:P31|wdt:P279')} ${WELL_KNOWN}`) },
  { id: 'nasdaq100', group: 'food', text: "Name a company in the Nasdaq-100", ...q(`${labelled('Nasdaq-100', 'wdt:P361')}`) },
  { id: 'dax', group: 'food', text: "Name a company in the DAX", ...q(`${labelled('DAX', 'wdt:P361')}`) },
];
PROMPTS.push(...BIG_BATCH);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One request at a time with a pause between them, as the query service asks.
let lane = Promise.resolve();
function getJson(url, tries = 1) {
  const run = async () => {
    for (let i = 0; ; i++) {
      await sleep(1200);
      let wait = 5000 * (i + 1);
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(65000) });
        if (res.ok) return await res.json();
        if (i >= tries) throw new Error(`${res.status} ${url.slice(0, 120)}`);
        const after = Number(res.headers.get('retry-after'));
        if (after) wait = Math.max(wait, after * 1000);
      } catch (e) {
        if (i >= tries) throw e;
      }
      await sleep(wait);
    }
  };
  const p = lane.then(run, run);
  lane = p.catch(() => {});
  return p;
}

// One Wikidata query per prompt returns the whole list: the article title, how many language
// editions of Wikipedia have the article (how well known it is), a short description and the
// alternative names. A category prompt asks the query service to read the category for us.
async function sparqlItems(pattern) {
  const query = `SELECT ?title ?sl ?desc (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
    ${pattern}
    ?i wikibase:sitelinks ?sl.
    OPTIONAL { ?i schema:description ?desc. FILTER(lang(?desc) = "en") }
    OPTIONAL { ?i skos:altLabel ?alt. FILTER(lang(?alt) = "en") }
  } GROUP BY ?title ?sl ?desc`;
  const r = await getJson('https://query.wikidata.org/sparql?' + new URLSearchParams({ format: 'json', query }));
  return r.results.bindings.map((b) => ({ title: b.title.value, pop: Number(b.sl.value), desc: b.desc?.value ?? '', alts: b.alts?.value ? b.alts.value.split('|') : [] }));
}
const ARTICLE = '?article schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?title.';
const categoryPattern = (name) => `{ SELECT ?title ?i WHERE { SERVICE wikibase:mwapi {
      bd:serviceParam wikibase:endpoint "en.wikipedia.org"; wikibase:api "Generator"; wikibase:limit 6000;
        mwapi:generator "categorymembers"; mwapi:gcmtitle "Category:${name.replace(/"/g, '\\"')}"; mwapi:gcmnamespace "0"; mwapi:gcmlimit "max".
      ?title wikibase:apiOutput mwapi:title. ?i wikibase:apiOutputItem mwapi:item.
    } FILTER(BOUND(?i)) } }`;

const JUNK = /\blists? of |^(Outline|Index|Timeline|History|Glossary|Bibliography) of |^Template:|\bdiscography\b|\bfilmography\b| in film$|^Danish Realm$|^Portrayal of /i;
const cleanName = (t) => t.replace(/\s*\([^)]*\)\s*$/, '').trim();
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');

async function gather(p) {
  const items = [];
  if (p.cats) for (const c of p.cats) items.push(...await sparqlItems(categoryPattern(c)));
  else items.push(...await sparqlItems(p.sparql + ' ' + ARTICLE));
  return items.filter((it) => it.title && !JUNK.test(it.title));
}

// Optional (--views): last month's readers of the English Wikipedia article, a better measure of
// how well known an answer is than the number of language editions. Asked for
// the best-linked VIEW_TOP of each list only; the tail keeps its language-count order below them.
const VIEW_TOP = 320;
const WITH_VIEWS = process.argv.includes('--views');
const VIEWS_FILE = path.join(CACHE, 'views.json');
let viewCache = null;
async function addViews(raw) {
  viewCache ??= fs.existsSync(VIEWS_FILE) ? JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8')) : {};
  const d = new Date(), end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const stamp = (x) => x.toISOString().slice(0, 10).replace(/-/g, '') + '00';
  const top = [...raw].sort((a, b) => b.pop - a.pop).slice(0, VIEW_TOP);
  const todo = top.filter((it) => !(it.title in viewCache));
  await Promise.all([0, 1, 2, 3].map(async () => {
    for (let it; (it = todo.shift()); ) {
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(it.title.replace(/ /g, '_'))}/monthly/${stamp(start)}/${stamp(end)}`;
      for (let i = 0; i < 4; i++) {
        try {
          const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
          if (res.ok) { viewCache[it.title] = (await res.json()).items.reduce((a, x) => a + x.views, 0); break; }
          if (res.status === 404) { viewCache[it.title] = 0; break; }
        } catch {}
        await sleep(2000 * (i + 1));
      }
      await sleep(60);
    }
  }));
  fs.writeFileSync(VIEWS_FILE, JSON.stringify(viewCache));
  // Reader counts are only used when the whole top of the list has them: a half-fetched list would rank worse than none.
  const complete = top.every((it) => it.title in viewCache);
  for (const it of raw) it.views = complete ? viewCache[it.title] ?? -1 : 0;
  return complete;
}

function shape(p, raw) {
  const byKey = new Map();
  for (const it of raw) {
    const name = cleanName(it.title);
    if (!name || (p.keep && !p.keep(name))) continue;
    const key = norm(name);
    const prev = byKey.get(key);
    if (prev && (prev.views - it.views || prev.pop - it.pop) >= 0) continue;
    const short = p.short ? p.short(name) : '';
    byKey.set(key, { name, pop: it.pop, views: it.views, desc: it.desc, aliases: short && short !== name ? [short, ...it.alts] : it.alts });
  }
  const list = [...byKey.values()].sort((a, b) => b.views - a.views || b.pop - a.pop || a.name.length - b.name.length || a.name.localeCompare(b.name)).slice(0, MAX_ANSWERS);
  const names = new Set(list.map((a) => norm(a.name)));
  const used = new Set();
  for (const a of list) {
    const own = norm(a.name);
    const out = [];
    for (const al of a.aliases) {
      const c = cleanName(al), k = norm(c);
      // An alias never shadows another answer's own name, or an alias a better-known answer already has.
      if (!k || k === own || k.length < 2 || c.length > 44 || names.has(k) || used.has(k) || JUNK.test(c)) continue;
      used.add(k);
      out.push(c);
      if (out.length >= 24) break;
    }
    a.aliases = out;
  }
  const n = list.length;
  const bunker = Math.min(10, Math.max(2, Math.round(n * 0.04)));
  const rough = bunker + Math.min(50, Math.max(3, Math.round(n * 0.1)));
  const fairway = rough + Math.min(280, Math.max(4, Math.round(n * 0.26)));
  list.forEach((a, i) => { a.tier = i < bunker ? 0 : i < rough ? 1 : i < fairway ? 2 : 3; });
  // The cup is the least-read answer among those we have reader counts for, or the tail's last.
  if (n > 8) list[n - 1].tier = 4;
  return { id: p.id, text: p.text, group: p.group, answers: list.map((a) => [a.name, a.tier, a.desc || '', ...a.aliases]) };
}

async function build(p, fresh) {
  const cacheFile = path.join(CACHE, `${p.id}.json`);
  let raw;
  // --cached-cats: skip category prompts that are not cached yet (for when the category service is down)
  if (p.cats && process.argv.includes('--cached-cats') && !fs.existsSync(cacheFile)) { console.log(`LATER ${p.id}`); return null; }
  if (!fresh && fs.existsSync(cacheFile)) raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  else {
    raw = await gather(p);
    if (raw.length) fs.writeFileSync(cacheFile, JSON.stringify(raw));
  }
  let ranked = 'languages';
  if (WITH_VIEWS) { if (await addViews(raw)) ranked = 'readers'; } else for (const it of raw) it.views = 0;
  const data = shape(p, raw);
  const n = data.answers.length;
  if (n < 10) { console.log(`SKIP ${p.id}: only ${n} answers`); return null; }
  fs.writeFileSync(path.join(OUT, `${p.id}.json`), JSON.stringify(data));
  const top = data.answers.slice(0, 4).map((a) => a[0]).join(', ');
  console.log(`${p.id}: ${n} answers by ${ranked} | top: ${top} | cup: ${data.answers[n - 1][0]}`);
  return { id: p.id, text: p.text, group: p.group, count: n };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });
  const only = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')));
  const manifest = [];
  const queue = [...PROMPTS];
  const results = new Map();
  await Promise.all([0, 1, 2].map(async () => {
    for (let p; (p = queue.shift()); ) {
      try { results.set(p.id, await build(p, only.has(p.id))); }
      catch (e) { console.log(`FAIL ${p.id}: ${e.message}`); results.set(p.id, null); }
    }
  }));
  for (const p of PROMPTS) if (results.get(p.id)) manifest.push(results.get(p.id));
  for (const file of fs.readdirSync(OUT)) if (file !== 'manifest.json' && !manifest.some((m) => m.id + '.json' === file)) fs.unlinkSync(path.join(OUT, file));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ built: new Date().toISOString().slice(0, 10), prompts: manifest }));
  console.log(`\n${manifest.length} of ${PROMPTS.length} prompts built`);
})();
