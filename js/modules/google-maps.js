class MapOptions {
    /**
     *
     * @param {Object} options
     * includes:
     * 1. selectors.map: class or id of map container
     * 2. selectors.autocomplete: class or id of input of type text to which to build address autocomplete
     * 3. selectors.radius: class or id of input/selector to which to bind to for radius selection
     * 4. selectors.country: class or id of input/selector to which to bind to for countries with which to scope autocomplete
     *    queries. NB: If present, selectors.autocomplete is required
     */
    constructor(options) {
        if (!options.selectors || !options.selectors.map || !document.querySelector(options.selectors.map)) {
            throw new Error('Map element selector is required!');
        }

        if (options.selectors.country && document.querySelector(options.selectors.country)) {
            if (!options.selectors.autocomplete || !document.querySelector(options.selectors.autocomplete)) {
                throw new Error('Autocomplete input selector is required to scope autocomplete results by country!');
            }
        }

        this._options = options;
    }

    /**
     * Get the map selector
     * @returns {string}
     */
    get map() {
        return this._options.selectors.map;
    }

    /**
     * Get the autocomplete input selector
     * @returns {string}
     */
    get autocomplete() {
        return this._options.selectors.autocomplete && document.querySelector(this._options.selectors.autocomplete) ?
            this._options.selectors.autocomplete : '';
    }

    /**
     * Get the radius input selector
     * @returns {*|null}
     */
    get radius() {
        return this._options.selectors.radius && document.querySelector(this._options.selectors.radius) ?
            this._options.selectors.radius : null;
    }

    /**
     * Get the country selector
     * @returns {string|null}
     */
    get country() {
        return this._options.selectors.country && document.querySelector(this._options.selectors.country) ?
            this._options.selectors.country : null;
    }

    /**
     * Get the location to plot
     * @returns {Object|null}
     */
    get location() {
        return this._options.location || null;
    }

    /**
     * Returns the zoom in factor
     * @returns {number}
     */
    get zoom() {
        return this._options.zoom || 11;
    }

    /**
     * Returns the map type
     * @returns {*|string}
     */
    get mapType() {
        return this._options.mapType || 'hybrid';
    }

    /**
     * Get the circle radius
     * @returns {number}
     */
    get radiusInMeters() {
        return this.radius ? parseInt(document.querySelector(this.radius).value) || 5000 : 5000;
    }
    /**
     * Get location changed event listener
     * @returns {null|function}
     */
    get locationChanged() {
        return this.hasLocationChangedListener() ? this._options.events.locationChanged : null;
    }

    /**
     * Returns true if a location listener is registered
     * @returns {boolean}
     */
    hasLocationChangedListener() {
        return this._options.events.locationChanged && typeof this._options.events.locationChanged == 'function';
    }

    /**
     * Returns true if location options were specified
     * @returns {boolean}
     */
    hasLocation() {
        return this._options.location && this._options.location.latitude && this._options.location.longitude;
    }
}

class Geocoder {
    constructor() {
        this._geocoder = new google.maps.Geocoder();
        this._addressComponents = null;
    }

    geocode(options) {
        let self = this;

        return new Promise((resolve, reject) => {
            self._geocoder.geocode(options, (results, status) => {
                if (status == google.maps.GeocoderStatus.OK && results.length > 0) {
                    self.addressComponents = results;

                    resolve(self.addressComponents);
                } else if (status == google.maps.GeocoderStatus.OVER_QUERY_LIMIT) {
                    // Retry the request after sometime
                    return setTimeout(function () {
                        self.geocode(options);
                    }, 1e3);
                } else {
                    reject(status);
                }
            });
        });
    }

    /**
     *
     * @param {*} results array of results from google geocoding service
     */
    set addressComponents(results) {
        let longName = null, shortName = null,
            addressComponents = {
                postalCode: {longName, shortName},
                streetNumber: {longName, shortName},
                streetName: {longName, shortName},
                city: {longName, shortName},
                district: {longName, shortName},
                stateOrProvince: {longName, shortName},
                country: {longName, shortName}
            };

        for (let i = results[0].address_components.length - 1; i >= 0; i--) {
            let component = results[0].address_components[i];

            if (component.types.indexOf("postal_code") >= 0) {
                addressComponents.postalCode.shortName = component.short_name;
                addressComponents.postalCode.longName = component.long_name;
            } else if (component.types.indexOf("street_number") >= 0) {
                addressComponents.streetNumber.shortName = component.short_name;
                addressComponents.streetNumber.longName = component.long_name;
            } else if (component.types.indexOf("route") >= 0) {
                addressComponents.streetName.shortName = component.short_name;
                addressComponents.streetName.longName = component.long_name;
            } else if (component.types.indexOf("locality") >= 0) {
                addressComponents.city.shortName = component.short_name;
                addressComponents.city.longName = component.long_name;
            } else if (component.types.indexOf("sublocality") >= 0) {
                addressComponents.district.shortName = component.short_name;
                addressComponents.district.longName = component.long_name;
            } else if (component.types.indexOf("administrative_area_level_1") >= 0) {
                addressComponents.stateOrProvince.shortName = component.short_name;
                addressComponents.stateOrProvince.longName = component.long_name;
            } else if (component.types.indexOf("country") >= 0) {
                addressComponents.country.shortName = component.short_name;
                addressComponents.country.longName = component.long_name;
            }
        }

        this._addressComponents = addressComponents;
        this._addressComponents.formattedAddress = results[0].formatted_address;
    }

    /**
     * Returns the address components object or null
     * @returns {{postalCode: {longName: *, shortName: *}, streetNumber: {longName: *, shortName: *}, streetName: {longName: *, shortName: *}, city: {longName: *, shortName: *}, district: {longName: *, shortName: *}, stateOrProvince: {longName: *, shortName: *}, country: {longName: *, shortName: *}}|*|null}
     */
    get addressComponents() {
        return this._addressComponents || null;
    }

    get formattedAddress() {
        return this.addressComponents ? this.addressComponents.formattedAddress || '' : '';
    }
}

class Map {
    constructor(options) {
        if (options) {
            this._mapOptions = new MapOptions(options);
        }
        this._isLoaded = false;
        this._gMap = null;
        this._geocoder = null;
        this._marker = null;
        this._circle = null;
        this._autocomplete = null;
    }

    mapLoadedListener() {
        this.isLoaded = true;
        console.debug('Google maps loaded!');
    }

    get isLoaded() {
        return this._isLoaded;
    }

    set isLoaded(isLoaded) {
        this._isLoaded = isLoaded;
    }

    get mapOptions() {
        return this._mapOptions;
    }

    set mapOptions(options) {
        if (!(options instanceof MapOptions)) {
            this._mapOptions = new MapOptions(options);
        }
    }

    get currentLocation() {
        return this._currentLocation;
    }

    set currentLocation(location) {
        location = !(location instanceof google.maps.LatLng) ?
            new google.maps.LatLng(location.latitude, location.longitude) :
            location;

        if (location instanceof google.maps.LatLng) {
            this._currentLocation = location;
            return true;
        }

        return false;
    }

    get currentLatitude() {
        return this.currentLocation ? this.currentLocation.lat() : '';
    }

    get currentLongitude() {
        return this.currentLocation ? this.currentLocation.lng() : '';
    }

    get addressComponents() {
        return this._geocoder ? this._geocoder.addressComponents : null;
    }

    getZoom() {
        let self = this;

        /**
         * Converts from kilometers to meters
         * @param {number} km
         * @returns {number}
         */
        function kilometersToMeters(km) {
            return km * 1000;
        }

        if (self.mapOptions.radiusInMeters <= kilometersToMeters(10)) {
            zoom = 11;
        } else if (self.mapOptions.radiusInMeters <= kilometersToMeters(20)) {
            zoom = 10;
        } else if (self.mapOptions.radiusInMeters <= kilometersToMeters(40)) {
            zoom = 9;
        } else if (self.mapOptions.radiusInMeters <= kilometersToMeters(75)) {
            zoom = 8;
        } else if (self.mapOptions.radiusInMeters <= kilometersToMeters(100)) {
            zoom = 7;
        } else if (self.mapOptions.radiusInMeters <= kilometersToMeters(200)) {
            zoom = 6;
        } else {
            zoom = 4;
        }
        return zoom;
    }

    create(options) {
        let self = this;

        // Invoke the setter to set the map options
        this.mapOptions = options;

        if (!this.isLoaded) {
            throw new Error('Map library not loaded!');
        }
        if (!this.mapOptions) {
            throw new Error('Map options not set!');
        }
        if (!this.mapOptions.hasLocation()) {
            console.debug('Getting user\'s current location');
            getUsersLocation();
        } else {
            console.debug('setting map location using map options: ', this.mapOptions.location);
            this.currentLocation = this.mapOptions.location;
            createMap();
        }

        // NB: Nested functions used here to simulate private methods
        /**
         * Get and set the current location
         */
        function getUsersLocation() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(geoLocationSuccess, getLocationError);
            } else {
                getLocationError();
            }

            function geoLocationSuccess(position) {
                self.currentLocation = {latitude: position.coords.latitude, longitude: position.coords.longitude};

                createMap();
            }

            function getLocationError() {
                self.currentLocation = {latitude: 5.6044018, longitude: -0.12188990000000001};

                createMap();
            }
        }

        /**
         * Create the map, geocoder, marker and circle objects
         */
        function createMap() {
            // Create the map object
            self._gMap = new google.maps.Map(document.querySelector(self.mapOptions.map), {
                center: self.currentLocation,
                zoom: self.getZoom() || self.mapOptions.zoom,
                mapTypeId: self.mapOptions.mapType,
                draggable: false
            });
            // Create the marker object
            self._marker = new google.maps.Marker({
                position: self.currentLocation,
                map: self._gMap,
                draggable: false
            });
            // Create the geocoder
            self._geocoder = new Geocoder();
            // Create circle around the marker
            addCircle();
            // Setup autocomplete binding
            setupAutocompleteListener();
            // Setup radius input listener
            registerRadiusInputListener();
        }

        /**
         * Create the circle
         */
        function addCircle() {
            self._circle = new google.maps.Circle({
                strokeColor: '#FF0000',
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: '#FF0000',
                fillOpacity: 0.35,
                map: self._gMap,
                center: self.currentLocation,
                radius: self.mapOptions.radiusInMeters
            });
        }

        /**
         * Setup listener on the address input
         */
        function setupAutocompleteListener() {
            if (!self.mapOptions.autocomplete) {
                return;
            }

            let options = {
                componentRestrictions: {}
            };

            self._autocomplete = new google.maps.places.Autocomplete(
                document.querySelector(self.mapOptions.autocomplete),
                options
            );

            self._autocomplete.addListener('place_changed', autocompleteHandler);

            /**
             *
             */
            function autocompleteHandler() {
                let place = self._autocomplete.getPlace();

                if (!place.geometry) {
                    return;
                }

                // Update the center locations of the map, marker and circle
                self._gMap.setCenter(place.geometry.location);
                self._marker.setPosition(place.geometry.location);
                self._circle.setCenter(place.geometry.location);
                self.currentLocation = place.geometry.location;

                self._geocoder.geocode({location: place.geometry.location})
                    .then(function () {
                        // Set the value of the address field to the formatted address of google maps
                        updateAutocompleteInput(self._geocoder.formattedAddress);
                        // Trigger location changed event listener callback
                        if (self.mapOptions.hasLocationChangedListener()) {
                            self.mapOptions.locationChanged(self._geocoder.addressComponents);
                        }
                    }, function (err) {
                        console.error('Geocoding error: ', err);
                    });
            }

            function updateAutocompleteInput(address) {
                document.querySelector(self.mapOptions.autocomplete).value = address;
            }
        }

        /**
         * Register radius input listener
         */
        function registerRadiusInputListener() {
            if (!self.mapOptions.radius) {
                return;
            }
            document.querySelector(self.mapOptions.radius).addEventListener('change', radiusListener);

            function radiusListener() {
                // Update the circle radius in meters
                updateCircleRadius();
            }

            function updateCircleRadius() {
                self._circle.setRadius(self.mapOptions.radiusInMeters);

                // Adjust map zoom to make radius visible
                self._gMap.setZoom(self.getZoom());
            }
        }
    }

    updateLocation(location) {
        let self = this;

        if (self.currentLocation = location) {
            self._gMap.setCenter(self.currentLocation);
            if (self._marker) {
                self._marker.setPosition(self.currentLocation);
            }
            if (self._circle) {
                self._circle.setCenter(self.currentLocation);
            }
        }
    }
}

let map = new Map();

export default map;