implement scheduler section in config to enable user:
change daily runtime
start/stop scheduler engine



implement named lists so user can better organize products. 



There are several issues that need to be addressed:

## 1 asins import process feedback
Once the user begins the process of importing ASINS (products), if the user clicks away there is no more feedback of the process. Fix this in order to provide the user with feedback until the process finishes.
## 2 Export data error
explain why the "export data" feature throws the errors and fix it:
GET http://localhost:5174/api/config/export-asins 401 (Unauthorized)
handleExportASINs @ Config.tsx:54
callCallback2 @ chunk-LPF6KSF2.js?v=027594c8:3680
invokeGuardedCallbackDev @ chunk-LPF6KSF2.js?v=027594c8:3705
invokeGuardedCallback @ chunk-LPF6KSF2.js?v=027594c8:3739
invokeGuardedCallbackAndCatchFirstError @ chunk-LPF6KSF2.js?v=027594c8:3742
executeDispatch @ chunk-LPF6KSF2.js?v=027594c8:7046
processDispatchQueueItemsInOrder @ chunk-LPF6KSF2.js?v=027594c8:7066
processDispatchQueue @ chunk-LPF6KSF2.js?v=027594c8:7075
dispatchEventsForPlugins @ chunk-LPF6KSF2.js?v=027594c8:7083
(anonymous) @ chunk-LPF6KSF2.js?v=027594c8:7206
batchedUpdates$1 @ chunk-LPF6KSF2.js?v=027594c8:18966
batchedUpdates @ chunk-LPF6KSF2.js?v=027594c8:3585
dispatchEventForPluginEventSystem @ chunk-LPF6KSF2.js?v=027594c8:7205
dispatchEventWithEnableCapturePhaseSelectiveHydrationWithoutDiscreteEventReplay @ chunk-LPF6KSF2.js?v=027594c8:5484
dispatchEvent @ chunk-LPF6KSF2.js?v=027594c8:5478
dispatchDiscreteEvent @ chunk-LPF6KSF2.js?v=027594c8:5455
installHook.js:1 Export error: Error: Authentication required
    at handleExportASINs (Config.tsx:58:15)

## 3 frontend enhancements
    3.1 in the "manage products" page:
- move the "Manage Products" to the center of the page
- stylize the "import ASINS" button, adding an icon with indication of csv file, and move it above the "lists" component
- resize the "add-product-section" by half and reposition the "category filter" beside it
- change the category filter to display the category list with a tree like structure.
    3.2 in the "Search Products" page:
- implement the newly modified category filter above the search textbox



