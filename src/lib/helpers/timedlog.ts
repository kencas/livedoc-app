/* Written by Levan Roinishvili */

export function timedlog(message?: any, ...optionalParams: any[]) {
    const now = new Date();
    const timestamp = '%c' +
        ('0' + now.getHours()).substr(-2) + ':' +
        ('0' + now.getMinutes()).substr(-2) + ':' +
        ('0' + now.getSeconds()).substr(-2) + ' %c' +
        ('00' + now.getMilliseconds()).substr(-3) + '%c';



    if ( typeof arguments[0] === 'string' ) {
        const oldArgs = Array.prototype.slice.call(arguments, 1);
        const newArgs = [
            timestamp + ' ' + arguments[0],
            'color: rgb(128,128,128);',
            'color: rgba(128,128,128,.5);',
            'color: unset;'
        ];
        console.log.call(console, ...newArgs, ...oldArgs);
    } else {
        console.log.call(console, timestamp, 'color: rgb(128,128,128);', 'color: rgba(128,128,128,.5);', 'color: unset;', ...arguments);
    }
}
