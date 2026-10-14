// Captures TMDB responses into tools/fixtures/*.json for mock mode (localStorage tmdbMock=1).
// Usage: node tools/make-fixtures.js <v4-read-token>  (token is a CLI arg; never stored in the fixtures)
var fs = require('fs'), path = require('path');
var T = process.argv[2]; if (!T) { console.error('usage: node tools/make-fixtures.js <token>'); process.exit(1); }
var OUT = path.join(__dirname, 'fixtures');
var APPEND = 'credits,reviews,videos,images,recommendations,external_ids';
var JOBS = {
  trending: '/trending/all/week?language=en-US',
  on_the_air: '/tv/on_the_air?language=en-US',
  now_playing: '/movie/now_playing?language=en-US&region=US',
  search_movie: '/search/movie?query=The%20Fix&year=2026&include_adult=false&language=en-US',
  search_tv: '/search/tv?query=MobLand&include_adult=false&language=en-US',
  find: '/find/tt0944947?external_source=imdb_id&language=en-US',
  images: '/tv/247718/images?include_image_language=en,null',
  details_movie: '/movie/1423191?language=en-US&include_image_language=en,null&append_to_response=' + APPEND,
  details_tv: '/tv/247718?language=en-US&include_image_language=en,null&append_to_response=' + APPEND,
  empty: null
};
(async function () {
  fs.mkdirSync(OUT, { recursive: true });
  for (var k in JOBS) {
    if (!JOBS[k]) { fs.writeFileSync(path.join(OUT, k + '.json'), '{"results":[]}'); continue; }
    var r = await fetch('https://api.themoviedb.org/3' + JOBS[k], { headers: { Authorization: 'Bearer ' + T, Accept: 'application/json' } });
    var j = await r.json();
    if (k === 'images') j = { logos: j.logos || [] };
    fs.writeFileSync(path.join(OUT, k + '.json'), JSON.stringify(j));
    console.log(k, r.status, JSON.stringify(j).length);
  }
})();
