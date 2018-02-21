//Score.score can be 1 = passed, 0 = not checked, -1 = failed
class Score{
	constructor(score = 0, message = "Not checked"){
		this.score = score;
		this.message = message;
	}

	get passed(){
		return this.score > 0
	}
}

class Report{
	constructor(){
		this.accessable = {
			first_attempt: new Score(),
			seconde_attempt: new Score(),
			get commbined(){
				if(first_attempt.passed && seconde_attempt.passed)
					return new Score(1, "Page is accessable");
				else if(!first_attempt.passed && !seconde_attempt.passed)
					return new Score(-1, "Both attempts failed");
				else if(!first_attempt.passed)
					return new Score(-1, "First attempt failed");
				else if(!seconde_attempt.passed)
					return new Score(-1, "Seconde attempt failed");
			}
		};

		this.license = new Score();

		this.headers = {
			cache: new Score(),
			etag: new Score(),
			cors: new Score()
		}

		this.rdf = new Score();
		this.fragmented = new Score();
		this.timestamped = new Score();
	}
}

class Validator{
	
	constructor(options = {protocol:'http:'}){
		this.options = options;

		this.detect_browser = require('detect-browser').detect();
		this.ldfetch = require("ldfetch");
		this.fetch = require('fetch-ponyfill')(options).fetch;
	}

	validate_url(url){
		this.report = new Report();
	
		return new Promise((fulfill) => {
			this.validate_headers(url)
				.then( result => { 
							this.validate_rdf(url)
								.then(result => { fulfill(this.report) });
						});
		});
		
	}

	validate_headers(url){
		return new Promise(fulfill => {
				this.fetch(url, this.options).then(response => {
						var headers_to_check_for = [{name: "Cache-Control", var: "cache"}, 
													{name: "ETag", var: "etag"}];

						for(var header of headers_to_check_for)
							this.check_header(header.name, header.var, response);

						//Check if we are in a browser, if so and the page loads we know that cors is set on the server because browser doesn't allow otherwise
						if(this.detect_browser.name != "node")
							this.report.headers.cors = new Score(1, "Page loaded, so assumed that CORS is supported");
						else
							this.check_header("Access-Control-Allow-Origin", "cors", response);

						this.report.accessable.first_attempt = new Score(1, "Page was accessable");
						fulfill(this.report);
					}).catch(error => {
						this.report.accessable.first_attempt = new Score(-1, error);
						fulfill(this.report);
					});
			});
	}

	check_header(header_name, header_id, response){
		if(response.headers.get(header_name)){
			this.report.headers[header_id] = new Score(1, response.headers.get(header_name));
		}else{
			this.report.headers[header_id] = new Score(-1, "Header not found");
		}
	}

	validate_rdf(url){
		return new Promise(fulfill => {(new this.ldfetch()).get(url).then(response => {
			this.report.rdf = new Score(1, "Parsed correctely");

			this.validate_license(response.triples);
			this.validate_fragmentation(response.triples);
			this.validate_timestamped(response.triples);

			this.report.accessable.seconde_attempt = new Score(1, "Page was accessable");
			fulfill(this.report);
		}).catch(error => {
			this.report.accessable.seconde_attempt = new Score(-1, error);
			fulfill(this.report);
		})});
	}

	validate_license(triples){
		var licenses_to_check = ["https://purl.org/dc/terms/license", "https://creativecommons.org/ns#license", "http://purl.org/dc/terms/license", "http://creativecommons.org/ns#license"]
		var licenses_found = [];

		for (var triple of triples)
			for(var license_type of licenses_to_check)
				if(triple.predicate == license_type)
					licenses_found.push(triple.object)

		if(licenses_found.length > 0)
			this.report.license = new Score(1, new Set(licenses_found));
		else
			this.report.license = new Score(-1, "No license found");
	}

	validate_fragmentation(triples){
		var hydra_to_check = ["https://www.w3.org/ns/hydra/core#previous", "https://www.w3.org/ns/hydra/core#next", "https://www.w3.org/ns/hydra/core#search", 
								"http://www.w3.org/ns/hydra/core#previous", "http://www.w3.org/ns/hydra/core#next", "http://www.w3.org/ns/hydra/core#search"]
		var hydra_links_found = [];

		for (var triple of triples)
			for(var hydra_type of hydra_to_check)
				if(triple.predicate == hydra_type)
					hydra_links_found.push({
						hydra: hydra_type,
						link: triple.object
					});

		if(hydra_links_found.length > 0)
			this.report.fragmented = new Score(1, new Set(hydra_links_found));
		else
			this.report.fragmented = new Score(-1, "No Hydra links found");
	}

	validate_timestamped(triples){
		var timestamps_to_check = ["http://www.w3.org/ns/prov#generatedAtTime", "https://www.w3.org/ns/prov#generatedAtTime"]

		for (var triple of triples)
			for(var timestamp_type of timestamps_to_check)
				if(triple.predicate == timestamp_type)
					this.report.timestamped = new Score(1, "Timestamp found");

		if(!this.report.timestamped.pass)
			this.report.license = new Score(-1, "No timestamps found");
	}
}

module.exports = Validator;