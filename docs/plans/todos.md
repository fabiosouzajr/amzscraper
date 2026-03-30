## 1 - Minor UI changes
    1.1 - In the price change dashboard:
        1.1.1 - modify the frontend component ui "price-drop-card" in dasboard.tsx, making "drop-header" into a 2 column layout. the left column containing "price-info" and the right containing "drop-header-content". 
        1.1.2 - reduce the "drop-amount" size making it more proportional. 
        1.1.3 - improve the "product-categories" display.
        1.1.4 - make the recharts graph datapoints(dates) standout.

## 2 Adding and scraping for additional parameters:
    2.1 let's use the item page "https://www.amazon.com.br/Air-cooler-processador-silencioso-eficiente/dp/B00IT14NVO" as an example; to check the selectors for following parameters:
    -- out of stock or unavailable indication
    -- remaining qty available (Somente 4 em estoque.)
     -- discounted item (ex. 60%)
    what i want you to do:
    examine the codebase in order to write a md file that details a step by step plan with the necessary backend, frontend and database changes necessary to implement this.
    these parameters should be incorporated and displayed into the Price Change Dashboard and 
    2.2 fix scraper price error when item is "Este produto está disponível apenas por vendedores terceiros" 

## 3 Comprehensive Logging system
implement background logging 



 ## 4 Implement product image fallback // DONE
    some items are not displaying images despite existing images on the amazon page. I want you examine the codebase in order to create a fallback method that enables these images to be displayed according to the existing logic. Images should be linked, not downloaded.
    here are some examples asins of products with no images: 
    B0DYFZSHZ4
    B0CXT2T3PG
    B0CN8V8R6Q

    PROMPT:

    
    Current behavior: Images use a single hardcoded URL pattern: images-na.ssl-images-amazon.com/images/P/{ASIN}.01._SCLZZZZZZZ_.jpg. When it fails (404), the wrapper is hidden — no fallback.

    The issue is likely that some newer products live on Amazon's newer CDN (m.media-amazon.com) or use a different URL structure than the old images-na pattern.

    The fallback Should be Scraper-enhanced — when a product is added/scraped, extract and store the actual image URL from the Amazon page. Frontend uses stored URL with a CDN fallback. This will require a DB migration and scraper change.
    For existing products that already have no image URL stored, we should 
    re-scrape them lazily, so that on first page load, if no image URL is stored, the frontend falls back to the CDN pattern (existing behavior) until the next scheduled scrape populates it.

## 5 Admin page