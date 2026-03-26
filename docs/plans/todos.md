## 1 - Minor UI changes
    1.1 - In the price change dashboard:
        1.1.1 - modify the frontend component ui "price-drop-card" in dasboard.tsx, making "drop-header" into a 2 column layout. the left column containing "price-info" and the right containing "drop-header-content". 
        1.1.2 - reduce the "drop-amount" size making it more proportional. 
        1.1.3 - improve the "product-categories" display.
        1.1.4 - make the recharts graph datapoints(dates) standout.

## 2 Adding and scraping for additional parameters:
let's use the item page "https://www.amazon.com.br/Air-cooler-processador-silencioso-eficiente/dp/B00IT14NVO" as an example; to check the selectors for following parameters:
 -- out of stock or unavailable indication
 -- remaining qty available (Somente 4 em estoque.)
 -- discounted item (ex. 60%)
what i want you to do:
examine the codebase in order to write a md file that details a step by step plan with the necessary backend, frontend and database changes necessary to implement this.
 these parameters should be incorporated and displayed into the Price Change Dashboard and 


## 3 Comprehensive Logging system
implement background logging 
 ## implement a fallback to get product images as some items do not have images