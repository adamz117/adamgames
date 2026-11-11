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
const labelled = (labels, prop = 'wdt:P31') => `VALUES ?lbl { ${[].concat(labels).map((l) => JSON.stringify(l) + '@en').join(' ')} } ?c rdfs:label ?lbl. ?i ${prop} ?c.`;
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
