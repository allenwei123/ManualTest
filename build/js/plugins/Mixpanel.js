// start Mixpanel
// (function(f,b){if(!b.__SV){var a,e,i,g;window.mixpanel=b;b._i=[];b.init=function(a,e,d){function f(b,h){var a=h.split(".");2==a.length&&(b=b[a[0]],h=a[1]);b[h]=function(){b.push([h].concat(Array.prototype.slice.call(arguments,0)))}}var c=b;"undefined"!==typeof d?c=b[d]=[]:d="mixpanel";c.people=c.people||[];c.toString=function(b){var a="mixpanel";"mixpanel"!==d&&(a+="."+d);b||(a+=" (stub)");return a};c.people.toString=function(){return c.toString(1)+".people (stub)"};i="disable track track_pageview track_links track_forms register register_once alias unregister identify name_tag set_config people.set people.set_once people.increment people.append people.union people.track_charge people.clear_charges people.delete_user".split(" ");
// for(g=0;g<i.length;g++)f(c,i[g]);b._i.push([a,e,d])};b.__SV=1.2;a=f.createElement("script");a.type="text/javascript";a.async=!0;a.src="undefined"!==typeof MIXPANEL_CUSTOM_LIB_URL?MIXPANEL_CUSTOM_LIB_URL:"https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js";e=f.getElementsByTagName("script")[0];e.parentNode.insertBefore(a,e)}})(document,window.mixpanel||[]);
// mixpanel.init("e054cca3303ffadfc2385f2f8a5a9b3a");
// end Mixpanel

define('mixpanel', ["jquery"], function ($) {

    const mixpanel = {};

    var token = null;
    const apiUrl = 'https://api.mixpanel.com';
    const eventUrl = apiUrl + "/track";
    const profileUrl = apiUrl + "/engage";

    var ignoring = false;

    mixpanel.init = function (t) {
        token = t;
    };

    mixpanel.ignore = function (doIgnore) {
        if (doIgnore) {
            ignoring = true;
        } else {
            ignoring = false;
        }
    };

    mixpanel.track = function (evt, properties) {
        properties = properties || {};
        properties.token = token;
        properties.distinct_id = properties.distinct_id || account.distinct_id;

        console.log("mixpanel track: %s, %O", evt, properties);
        if (ignoring) {
            return;
        }

        var eventObj = {
            'event': evt,
            'properties': properties
        };

        var encoded = base64(JSON.stringify(eventObj));

        var url = eventUrl + "?data=" + encoded;

        $.get(url, function (data) {
            if (data === 1) {
                console.log("succeed tracking: " + evt);
            } else if (data === 0) {
                console.log("failed tracking: %s", evt);
            } else {
                console.log("unknown response from tracking: " + data);
            }
        });
    };

    mixpanel.alias = function (originalId, newId) {
        mixpanel.track("$create_alias", {
            distinct_id: originalId,
            alias: newId
        });
    };

    mixpanel.engage = function (action, value) {
        properties = {};
        properties.$token = token;
        properties.$distinct_id = account.distinct_id;
        properties["$" + action] = value;

        console.log("mixpanel engage: %s, %O", evt, properties);
        if (ignoring) {
            return;
        }

        var encoded = base64(JSON.stringify(properties));
        var url = profileUrl + "?data=" + encoded;

        $.get(url, function (data) {
            if (data === 1) {
                console.log("succeed storing profile: " + properties);
            } else if (data === 0) {
                console.error("failed storing profile");
            } else {
                console.error("unknown response from storing profile: " + data);
            }
        });
    };

    // Modified from http://cdn.mxpnl.com/libs/mixpanel-2-latest.js
    var base64 = function (data) {
        var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        var o1, o2, o3, h1, h2, h3, h4, bits, i = 0, ac = 0, enc = "", tmp_arr = [];

        if (!data) {
            return data;
        }

        data = utf8Encode(data);

        do { // pack three octets into four hexets
            o1 = data.charCodeAt(i++);
            o2 = data.charCodeAt(i++);
            o3 = data.charCodeAt(i++);

            bits = o1 << 16 | o2 << 8 | o3;

            h1 = bits >> 18 & 0x3f;
            h2 = bits >> 12 & 0x3f;
            h3 = bits >> 6 & 0x3f;
            h4 = bits & 0x3f;

            // use hexets to index into b64, and append result to encoded string
            tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
        } while (i < data.length);

        enc = tmp_arr.join('');

        switch (data.length % 3) {
            case 1:
                enc = enc.slice(0, -2) + '==';
                break;
            case 2:
                enc = enc.slice(0, -1) + '=';
                break;
        }

        return enc;

        function utf8Encode(string) {
            string = (string + '').replace(/\r\n/g, "\n").replace(/\r/g, "\n");

            var utftext = "",
                start,
                end;
            var stringl = 0,
                n;

            start = end = 0;
            stringl = string.length;

            for (n = 0; n < stringl; n++) {
                var c1 = string.charCodeAt(n);
                var enc = null;

                if (c1 < 128) {
                    end++;
                } else if ((c1 > 127) && (c1 < 2048)) {
                    enc = String.fromCharCode((c1 >> 6) | 192, (c1 & 63) | 128);
                } else {
                    enc = String.fromCharCode((c1 >> 12) | 224, ((c1 >> 6) & 63) | 128, (c1 & 63) | 128);
                }
                if (enc !== null) {
                    if (end > start) {
                        utftext += string.substring(start, end);
                    }
                    utftext += enc;
                    start = end = n + 1;
                }
            }

            if (end > start) {
                utftext += string.substring(start, string.length);
            }

            return utftext;
        }
    };

    return mixpanel;
});