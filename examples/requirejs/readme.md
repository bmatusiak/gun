What is this
------------

THis shows off how gun and other components can be used with requirejs. 
It uses requirejs to fetch in browser and load like require in nodejs.
This will allow developers that load the gun src instead of the built/bundle code for testing
or if they use requirejs it shows them how to add it into there codebase
You can refresh browser after editing src without building gun.

Setup
-----

```
npm install express
node server.js
```


if you need ssl,  selfsigned can be used
```
npm install selfsigned
SSL=true node server.js
```
