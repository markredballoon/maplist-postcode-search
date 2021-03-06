const MAX_RANGE = 10; // Max range for locations in miles
let _LOCATIONS = []; // Stores the locations
let _GEOCODER = null; // will be the google maps geocoder instance
const LOCATIONS_ENDPOINT = "locations.json";
const CACHE_TIME = 3000000;

// This function runs when the google script has finished loading
function initMap() {
  _GEOCODER = new google.maps.Geocoder();
};

/**
 * Asyncronously get the locations data. 
 * Allows for localstorage cache on brosers that support it
 */
const async_get_locations = async() => {

  // Store the current time in ms
  const now = Date.now();

  // If local storage exists, then use it to get a cached version of the data
  if (!!localStorage) {
    // Check the last time new data was pulled to see if the information should be refreshed
    const last_refresh = localStorage.getItem("locations_last_pull")
    if (last_refresh && now - last_refresh < CACHE_TIME) {
      // Attempts to get the data from the local storage
      try {
        const stored_locations = JSON.parse(localStorage.getItem("locations_cached"));
        if (!!stored_locations && stored_locations.length > 0) {
          _LOCATIONS = stored_locations;
          return;
        }
      } catch (e) {
        console.log(e);
      }
    }
  }

  // asyncronously get the information
  const locations_resp = await fetch(LOCATIONS_ENDPOINT)
    .catch(e => console.log(e));
  _LOCATIONS = await locations_resp.json();

  // Cache the data into the localstorage
  if (!!localStorage) {
    localStorage.setItem("locations_last_pull", now);
    localStorage.setItem("locations_cached", JSON.stringify(_LOCATIONS));
  }
}

async_get_locations(localStorage);

/**
 * Gets the geocode of a postcode
 * @param {string} postcode 
 * @returns {Location}
 */
const postCodeLookup = async postcode => new Promise(
  function(resolve, reject) {
    _GEOCODER.geocode({ 'address': postcode },
      function(results, status) {
        if (status == 'OK') {
          resolve(
            results[0].geometry.location
          );
        } else {
          reject(
            'Geocode was not successful for the following reason: ' + status
          );
        }
      }
    );
  }
);

/**
 * Filters the locations and returns the ones that are within the max range
 * 
 * @param {Location} user_location 
 * @returns {Array|string}
 */
const locationsFiltered = async user_location => new Promise(
  function(resolve, reject) {

    if (!user_location || !user_location.lat || !user_location.lng) {
      reject('User location is not valid')
    }

    let local_locations = _LOCATIONS.filter(this_location => {
      const distance_to_location = distance(
        user_location.lat(),
        user_location.lng(),
        this_location.latitude,
        this_location.longitude
      );
      this_location.__distance = distance_to_location;
      if (distance_to_location <= MAX_RANGE) return this_location;
    });

    if (local_locations.length > 0) {
      resolve(local_locations);
    } else {
      reject('There are no local locations.');
    }
  }
);

/**
 * Sorts Maplist objects by __distance attribute
 */
const distanceSort = (a, b) => {
  if (a.__distance > b.__distance) return 1;
  if (b.__distance > a.__distance) return -1;
  return 0;
}

// Add the location Vue component to display the location when it is found
Vue.component('TheLocation', {
  template: `
    <div class="location" v-if='location != null'>
      <div class="location_title">{{ location.title }}</div>
      <div class="location_description" v-html=location.description ></div>
    </div>
  `,
  props: ["location"]
})

// Create the Vue app to handle the form responce
const app = new Vue({
  el: '#postcode_search',
  data() {
    return {
      postcode: 'RG456AJ',
      loading: false,
      location: null
    }
  },
  methods: {
    /**
     * Validates the postcode
     */
    validatePostCode() {
      let postcode = this.postcode;
      postcode = postcode.replace(/\s/g, "");
      const regex = /^[A-Z]{1,2}[0-9]{1,2} ?[0-9][A-Z]{2}$/i;
      return regex.test(postcode);
    },

    /**
     * Listens for an enter button press and searches when made
     * @param {Event} event 
     */
    enterListener(event) {
      if (event.keyCode === 13) {
        this.search();
      }
    },

    /**
     * Does a thing if the postcode is invalid
     */
    invalidPostCode() {
      alert("That is not a valid postcode!");
    },

    /**
     * Does a thing if there are no locations found
     */
    noLocationsFound() {
      alert("No locations found")
    },

    /**
     * Checks that the geocode has loaded
     */
    geocodeLoaded() {
      return _GEOCODER &&
        _GEOCODER.__proto__.hasOwnProperty("geocode") &&
        "function" === typeof _GEOCODER.geocode
    },

    // Handler for the search function. 
    // Fires when the user clicks the go button
    async search() {

      // Check if geocode has been loaded and 
      // that a search isn't still under way
      if (!this.geocodeLoaded() || this.loading) return;

      // Check for a valid postcode
      if (!this.validatePostCode()) {
        return this.invalidPostCode();
      };

      // Reset location
      this.location = null;

      // Set loading to true to prevent accidental spam on the API
      this.loading = true;

      // Get the users location
      const user_location = await postCodeLookup(this.postcode)
        .catch(e => console.log(e));

      // Use the users location to find their local stores
      const local_stores = await locationsFiltered(user_location)
        .catch(e => console.log(e));

      // If there are no stores found
      if (!local_stores || local_stores.length < 1) {
        this.loading = false;
        return this.noLocationsFound();
      }

      // Sort the stores by distance
      const local_stores_sorted = local_stores.sort(distanceSort);

      // Get the first item from the array
      this.location = local_stores_sorted.shift();
      // Set loading to false
      this.loading = false;
    }
  }
});
