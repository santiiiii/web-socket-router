'use strict';

/*
* Router Receives a connection String
*
* it will perform the conneciton to the server. Anytime the connection si closed
* it will try to reconnect. Until it fails several times.
*
*/
var WebSocketRouter = function WebSocketRouter(connection_query, ctx) {

    //
    var BEFORE = 'BEFORE';

    //
    var AFTER = 'AFTER;';

    /*
    * @name Connection Handler
    *
    * The connection handler will keep the connection with the server
    * Established. If the connection is closed the connection handler will
    * attempt to connect up to a maximum o 10 retries.
    * Connection handler will also keep a connection queue in which
    * messages delivered while the connection was closed, closing or opening
    * will be re-sent as soon as the connection is ready.
    *
    * @constructor
    * @param {String} connection_query
    *   Defines the FQDM to connect to (eg: ws(s)://localhost:8080)
    * @param {Function} on_message
    *   Defines the callback function that will be exectued every time
    *   a new message is received from the server
    * @return {ConnectionHandler}
    *
    */
    function ConnectionHandler(connection_query, on_message) {

        // Connection query could be used to re-establish
        // The connection in case is lots
        this.connection_query = connection_query;

        // Connection on message will be used to dispatch
        // Messages
        this.on_message = on_message;

        // Holds any message dispatched before the connection
        // was established
        // Also, if the connection is closed, the WS, will Hold
        // the message and try to reconnect to send it
        this.messageQueue = [];

        // Connection retry will hold the attempts
        // Before giviging up 10 retries
        this.connectionsAttemp = 0;

        // Attemp to connect for the first time
        this.connect();
    }

    /*
    * @name Connect
    *
    * Establish the connection with the server and sets the
    * on* listeners of the websocket object.
    *
    * @function
    * @return {None}
    *
    */
    ConnectionHandler.prototype.connect = function () {

        // Increase the attemp count by one to let know
        // That a connection has been alread tried
        this.connectionsAttemp++;

        // The connection is established using WebSocket
        // If the connection is closed, the Handler will try
        // To reconnect
        this.connection = new WebSocket(this.connection_query);

        // Whenever the new connection is open, the connection
        // Handler will flush the messageQueue
        this.connection.onopen = this.flush.bind(this);

        // Whenever the connection is closed, the WS
        // Will try to reconnect up to 10 times.
        this.connection.onclose = this.reconnect.bind(this);

        // Connection on-message will dispatch all received
        // Messages to the wrapper class. Messages will be dispatched
        // Already parsed
        this.connection.onmessage = this.dispatch.bind(this);
    };

    /*
    * @name Dispatch
    *
    * Sends the new arrived message to the provided callback
    *
    * @function
    * @return {None}
    *
    */
    ConnectionHandler.prototype.dispatch = function (message) {
        this.on_message(JSON.parse(message.data));
    };

    /*
    * @name Reconnect
    *
    * Attempts to reconnect to the server up to ten 10 times.
    * Logs an error if the maximum retry limit is reached.
    *
    * @function
    * @return {None}
    *
    */
    ConnectionHandler.prototype.reconnect = function () {

        // If 10 attempts reached, web-socket-router will assume that
        // the server is permanently down
        if (this.connectionsAttemp < 10) {

            // Waits for a second to make sure that,
            // if the server was down for a moment, the connecction wont fail
            setTimeout(this.connect.bind(this), 1000);
        } else {
            console.log('10 Attemps to connect failed to the server ' + this.connection_query + '. Is server up?');
        }
    };

    /*
    * @name Flush
    *
    * Execute all messages in the Message Queue
    *
    * @function
    * @return {None}
    *
    */
    ConnectionHandler.prototype.flush = function () {

        // Reset the connections attempt since the connection,
        // Has been stablished sucesfully
        this.connectionsAttemp = 0;

        // Execute all queued messages
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
            for (var _iterator = this.messageQueue[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var message = _step.value;

                this.send(message);
            }

            // Empty the message Queue could provoke an issue when The
            // messages beeing flushed are producing erros that push them back
            // To the queue. Messages could be lost
        } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion && _iterator.return) {
                    _iterator.return();
                }
            } finally {
                if (_didIteratorError) {
                    throw _iteratorError;
                }
            }
        }

        this.messageQueue = [];
    };

    /*
    * @name Send
    *
    * Sends the object as a stringified message to the server
    * If the connection fails, stores the message in the message Queue
    *
    * @function
    * @param {Object}
    *   Object containing all the data that will be sent to the server
    * @return {None}
    *
    */
    ConnectionHandler.prototype.send = function (message) {
        try {
            this.connection.send(JSON.stringify(message));
        } catch (err) {
            this.messageQueue.push(message);
        }
    };

    /*
    * @name Close
    *
    * Closes the connection and clears all data related to the object
    *
    * @function
    * @return {None}
    *
    */
    Router.prototype.close = function () {
        this.messageQueue = [];

        if (this.connection.readyState == 1) {
            this.connection.close();
        } else {
            this.connection.onopen = function () {
                this.connection.close();
            };
        }
    };

    /*
    * @name Router
    *
    * Implements a routifier which lets you define URL to your handlers
    * The URLs will respond to methods and chainable, meaning that a chai
    * of responsability (by the given order) will be respected.
    * If one of the handlers, fails, it will break the chain.
    * Optionally, actions (in a similar fashion to REST) can be defined,
    * also filters.
    * You can attach hooks to your url handlers which will let you prepare your
    * data or scenario before executing a particular task or set of tasks
    *
    * @constructor
    * @param {String} connection_query
    *   Defines the FQDM to connect to (eg: ws(s)://localhost:8080)
    * @param {*} ctx
    *   Defines the root context to which all the Handlers will be attached by
    *   default, if no other handler is specified
    * @return {Router}
    *
    */
    function Router(connection_query, ctx) {

        this.action = {
            UPDATE: 'UPDATE',
            DELETE: 'DELETE',
            CREATE: 'CREATE',
            SUBSCRIBE: 'SUBSCRIBE',
            REQUEST: 'REQUEST'
        };

        //Due to several version of the router beeing used on different places of the application
        this.version = '1.3.2';

        //
        this.events = [];

        //
        this.lastEvents = [];

        //
        this.registeredTasks = [];

        // Will manage all connection-related aspects
        // Of the WebSocket
        this.connection = new ConnectionHandler(connection_query, this.dispatch.bind(this));
    }

    /*
    * @name Send
    *
    * Executes the current message, and the BEFORE and AFTER hooks
    *
    * @function
    * @param {Object} message
    *   Object message to be sent to the server
    * @return {None}
    *
    */
    Router.prototype.send = function (message) {
        try {
            this.executeTaks(message, BEFORE);
            this.connection.send(message);
            this.executeTaks(message, AFTER);
        } catch (err) {
            console.log(err);
        }
    };

    /*
    * @name Exception Handler
    *
    * Receives an error and returns a message ready to be
    * delivered to the client.
    *
    * @function
    * @param {Error} error
    *   Object message to be sent to the server
    * @return {None}
    *
    */
    Router.prototype.ExceptionHandler = function (error) {
        return {
            'message': error.stack
        };
    };

    /*
    * @name On
    *
    * Receives a route and a callback and returns a builder object
    * that will let you define, chainable, action, filters, bind and executeLast,
    * properties.
    *
    * action - receives a constante (or value) and filter also by defined
    *          action in the server.
    *
    * filters - receives an object and filter also by key-values defined in the
    *           filters, and also present in the received message.
    *
    * bind - Receives any object and binds the callback to the specified context.
    *
    * executeLast - will push this callback to the end of the event queue, beeing
    *               making it the last in the chain of responsability.
    *
    * @function
    * @param {String} name
    *   Route to match
    * @param {Function} callback
    *   Callback to execute whenever the criterias ar meet
    * @return {{
    *   action: {Function} (action),
    *   filters: {Function} (object),
    *   bind: {Function} (context),
    *   executeLast: {Function} ()
    * }}
    *
    */
    Router.prototype.on = function (n, fn) {
        var event = { n: this.routify(n), fn: fn, action: "*" };
        this.events.push(event);

        return new function () {
            this.action = function (ACTION) {
                if (ACTION) event.action = ACTION;

                return this;
            };

            this.filters = function (filters) {
                if (filters) event.filters = filters;

                return this;
            };

            this.bind = function (bind) {
                if (bind) event.bind = bind;

                return this;
            };

            this.executeLast = function () {
                lastEvents.push(events[events.indexOf(event)]);
                delete events[events.indexOf(event)];
                events.length = events.length - 1;
            };
        }();
    };

    /*
    * @name Delete
    *
    * Receives a route, a callback and filters, creates a new listener for
    * those criterias and the DELETE action
    *
    * @function
    * @param {String} name
    *   Route to match
    * @param {Function} callback
    *   Callback to execute whenever the criterias ar meet
    * @param {Object} filters
    *   Object used to match parameters in the body and filter messages.
    * @return {{
    *   action: {Function} (action),
    *   filters: {Function} (object),
    *   bind: {Function} (context),
    *   executeLast: {Function} ()
    * }}
    *
    */
    Router.prototype.delete = function (n, fn, filters) {
        return this.on(n, fn).action(this.action.DELETE).filters(filters);
    };

    /*
    * @name Update
    *
    * Receives a route, a callback and filters, creates a new listener for
    * those criterias and the UPDATE action
    *
    * @function
    * @param {String} name
    *   Route to match
    * @param {Function} callback
    *   Callback to execute whenever the criterias ar meet
    * @param {Object} filters
    *   Object used to match parameters in the body and filter messages.
    * @return {{
    *   action: {Function} (action),
    *   filters: {Function} (object),
    *   bind: {Function} (context),
    *   executeLast: {Function} ()
    * }}
    *
    */
    Router.prototype.update = function (n, fn, filters) {
        return this.on(n, fn).action(this.action.UPDATE).filters(filters);
    };

    /*
    * @name Create
    *
    * Receives a route, a callback and filters, creates a new listener for
    * those criterias and the CREATE action
    *
    * @function
    * @param {String} name
    *   Route to match
    * @param {Function} callback
    *   Callback to execute whenever the criterias ar meet
    * @param {Object} filters
    *   Object used to match parameters in the body and filter messages.
    * @return {{
    *   action: {Function} (action),
    *   filters: {Function} (object),
    *   bind: {Function} (context),
    *   executeLast: {Function} ()
    * }}
    *
    */
    Router.prototype.create = function (n, fn, filters) {
        return this.on(n, fn).action(this.action.CREATE).filters(filters);
    };

    /*
    * @name Request
    *
    * Receives a route, a callback and filters, creates a new listener for
    * those criterias and the REQUEST action
    *
    * @function
    * @param {String} name
    *   Route to match
    * @param {Function} callback
    *   Callback to execute whenever the criterias ar meet
    * @param {Object} filters
    *   Object used to match parameters in the body and filter messages.
    * @return {{
    *   action: {Function} (action),
    *   filters: {Function} (object),
    *   bind: {Function} (context),
    *   executeLast: {Function} ()
    * }}
    *
    */
    Router.prototype.request = function (n, fn, filters) {
        return this.on(n, fn).action(this.action.REQUEST).filters(filters);
    };

    /*
    * @name Subscribe
    *
    * Receives a route, a callback and filters, creates a new listener for
    * those criterias and the SUBSCRIBE action
    *
    * @function
    * @param {String} name
    *   Route to match
    * @param {Function} callback
    *   Callback to execute whenever the criterias ar meet
    * @param {Object} filters
    *   Object used to match parameters in the body and filter messages.
    * @return {{
    *   action: {Function} (action),
    *   filters: {Function} (object),
    *   bind: {Function} (context),
    *   executeLast: {Function} ()
    * }}
    *
    */
    Router.prototype.subscribe = function (n, fn, filters) {
        return this.on(n, fn).action(this.action.SUBSCRIBE).filters(filters);
    };

    /*
    * @name Intercept
    *
    * Mirros send function. Create for more client legibility and code
    * Maintanability
    *
    * @function
    * @param {String} name
    *   Route to match
    * @param {Function} callback
    *   Callback to execute whenever the criterias ar meet
    * @return {{
    *   action: {Function} (action),
    *   filters: {Function} (object),
    *   bind: {Function} (context),
    *   executeLast: {Function} ()
    * }}
    *
    */
    Router.prototype.intercept = function (n, fn) {
        this.events.push({ n: this.routify(n), fn: fn });
    };

    /*
    * @name Before Send
    *
    * Attachs a before send hook to a particular route.
    *
    * @function
    * @param {String} name
    *   Route to match
    * @param {Function} callback
    *   Callback to execute whenever the criterias ar meet
    * @return {None}
    *
    */
    Router.prototype.beforeSend = function (route, fn) {
        this.registerSendTask(route, fn, BEFORE);
    };

    /*
    * @name After Send
    *
    * Attachs a after send hook to a particular route.
    *
    * @function
    * @param {String} name
    *   Route to match
    * @param {Function} callback
    *   Callback to execute whenever the criterias ar meet
    * @return {None}
    *
    */
    Router.prototype.afterSend = function (route, fn) {
        this.registerSendTask(route, fn, AFTER);
    };

    /*
    * @name Register Send Task
    *
    * Attachs a hook, by the defined criterias. (Not intended for public use yet)
    *
    */
    Router.prototype.registerSendTask = function (route, fn, position) {
        this.registeredTasks.push({
            route: this.routify(route),
            fn: fn,
            position: position
        });
    };

    /*
    * @name Message
    *
    * Sends a message to the server. The default route is * which can be
    * Overriten. All parameters are optional.
    *
    * @function
    * @param {{
    *   route: {String},
    *   action: {String},
    *   data: {Object}
    * }} options
    * @return {None}
    *
    */
    Router.prototype.message = function (options) {
        this.send(Object.assign({ route: "*" }, options));
    };

    /*
    * @name Apply Filters
    *
    * Checks if an object meets the filters criteria (Not intended for public use)
    *
    * @function
    * @param {Object} target_filters
    * @param {Object} destiny_filters
    * @return {Boolean}
    *
    */
   Router.prototype.applyFilters = function (dataFilters, eventFilters) {
        var isFilterMatching = true;

        Object.keys(eventFilters).forEach(key => {
            if (!this.routify(dataFilters[key].toString ()).exec(eventFilters[key].toString ())) {
                isFilterMatching = false;
            }
        });

        return isFilterMatching;
    }

    /*
    * @name Should Event Execute
    *
    * Checks if a event should execute or not (Not intended for public use)
    *
    * @function
    * @param {Object} data
    * @param {Object} evt
    * @return {Boolean}
    *
    */
    Router.prototype.shouldEventExecute = function (data, evt) {
        if (!this.routify (evt.action).exec(data.action)) {
            return false;
        }

        if ((evt.filters && !data.data) || (data.data && evt.filters && !this.applyFilters(data.data, evt.filters))) {
        return false;
        }

        return evt.n.exec(data.route);
    }

    /*
    * @name Should Task Execute
    *
    * Checks if a task should execute or not (Not intended for public use)
    *
    * @function
    * @param {Object} data
    * @param {Object} task
    * @param {String} position
    * @return {Boolean}
    *
    */
    Router.prototype.shouldTaskExecute = function (data, task, position) {
        if (position != task.position) {
            return false;
        }

        return task.route.exec(data.route);
    };

    /*
    * @name Apply To Queue
    *
    * Adds the current event to the execution queue (Not intended for public use)
    *
    * @function
    * @param {Object} event
    * @param {Array} run
    * @return {None}
    *
    */
    Router.prototype.applyToQueue = function (evt, run) {
        if (evt.fn instanceof Array) {
            for (var j = 0; j < evt.fn.length; j++) {
                run.push(evt.fn[j].bind(evt.bind ? evt.bind : ctx));
            }
        } else {
            run.push(evt.fn.bind(evt.bind ? evt.bind : ctx));
        }
    };

    /*
    * @name Dispatch
    *
    * Dispatchs the current event and the associated hooks (Not intended for public use)
    *
    * @function
    * @param {Object} data
    * @return {None}
    *
    */
    Router.prototype.dispatch = function (data) {
        var run = [];

        //Events
        for (var i = 0; i < this.events.length; i++) {
            if (this.shouldEventExecute(data, this.events[i])) {
                this.applyToQueue(this.events[i], run);
            }
        }

        //Execute Last Events
        for (var i = 0; i < this.lastEvents.length; i++) {
            if (this.shouldEventExecute(data, this.lastEvents[i])) {
                this.applyToQueue(this.lastEvents[i], run);
            }
        }

        this.runner(run, data.data);
    };

    /*
    * @name Runner
    *
    * Runs the provided callbacks array (Not intended for public use)
    *
    * @function
    * @param {Array} run
    * @param {Object} data
    * @return {None}
    *
    */
    Router.prototype.runner = function (run, data) {
        try {
            for (var i = 0; i < run.length; i++) {
                run[i](data);
            }
        } catch (e) {
            this.error(this.ExceptionHandler(e));
        }
    };

    /*
    * @name Routify
    *
    * Turns a Route String into a regex (Not intended for public use)
    *
    * @function
    * @param {String} route
    * @return {Regex}
    *
    */
    Router.prototype.routify = function (n) {
        return new RegExp('^' + n.replace(/\*/g, '[^\/]+').replace(/\//g, '\\/') + '$', '');
    };

    /*
    * @name Error
    *
    * Sends an error whenever the server or the client
    * has failed (Not intended for public use)
    *
    * @function
    * @param {Error} error
    * @return {None}
    *
    */
    Router.prototype.error = function (error) {
        this.send({ route: '/socket/error', data: error });
    };

    /*
    * @name Execute Tasks
    *
    * Executes all the tasks by a hook identifier (Not intended for public use)
    *
    * @function
    * @param {Object} data
    * @param {String} position
    * @return {None}
    *
    */
    Router.prototype.executeTaks = function (data, position) {
        for (var i = 0; i < this.registeredTasks.length; i++) {
            if (this.shouldTaskExecute(data, this.registeredTasks[i], position)) {
                this.registeredTasks[i].fn.bind(ctx)(data);
            }
        }
    };

    return new Router(connection_query, ctx);
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') module.exports = WebSocketRouter;

