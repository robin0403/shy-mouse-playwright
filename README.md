#  Shy Mouse Playwright

A simple npm package to humanize mouse movements in Playwright or Patchright.

A version for **Puppeteer** is currently being **developed** and will be released once it has passed all tests.



##  Install



###  Package managers

npm: `npm i @ab6162/shy-mouse-playwright`

##  Usage

Using this package is quite easy; you just need to call it and pass a Page.  At the moment, it has two methods:
1. Click on an element.
2. Generate a random movement.

In a future version, the option to generate a random movement for an element without clicking will be added, along with some other options related to mouse configuration.

This small package was created with the aim of avoiding detection by non-human movements as much as possible. Combined with Patchright, it becomes a powerful automation tool.

The package doesn't collect any kind of data, which you can see in the source code published in [GitHub](https://github.com/ab6162/shy-mouse-playwright)



This is an tiny example code for use:



``` javascript

// Example usage in a Playwright or Patchright script:
const  {  chromium  }  =  require('patchright');
const  MouseHelper  =  require('@ab6162/shy-mouse-playwright');

(async  ()  =>  {

	const browser = await chromium.launch({ headless:  false  });
	const page = await browser.newPage();

	await page.goto('https://example.com');

	const mouseHelper = new MouseHelper(page);

	await mouseHelper.click('button#myButton', {
		clickPadding:  0.7,
		viewPadMin:  30,
		viewPadMax:  80
	});

	await mouseHelper.click('a#nextLink');

	await mouseHelper.move();

	await browser.close();

})();

```

##  How it works

It works by using Bezier curves and Fitts' law to avoid strange curved movements in impossible times that are not human.


##  Issues

If there are any bugs, questions or improvements open a new issue


##  License

MIT