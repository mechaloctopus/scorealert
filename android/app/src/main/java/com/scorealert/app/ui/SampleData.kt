package com.scorealert.app.ui

import com.scorealert.app.model.Explanation
import com.scorealert.app.model.Facts
import com.scorealert.app.model.Listing
import com.scorealert.app.model.Score

/** Local sample listings so the UI is demonstrable in previews / before backend wiring. */
object SampleData {
    val listings = listOf(
        Listing(
            id = "lst_1",
            sourceId = "facebook",
            canonicalUrl = "https://www.facebook.com/marketplace/item/1001",
            title = "2006 Toyota Tacoma - runs and drives",
            description = "2006 Toyota Tacoma, 184k miles. Runs and drives, needs a starter soon. Clean title, registration current. 4x4, automatic. Must sell, leaving island.",
            price = 1500.0,
            town = "Līhuʻe",
            primaryImageUrl = null,
            firstSeenAt = "2026-08-16T00:00:00Z",
            facts = Facts(category = "truck", make = "Toyota", model = "TACOMA", year = 2006, mileage = 184000, runningStatus = "runs_and_drives", titleStatus = "clean", registrationStatus = "current", drivetrain = "4x4", transmission = "automatic", issues = listOf("starter")),
            score = Score(overall = 93, price = 24, freshness = 25, category = 15, condition = 9, location = 10, keyword = 10, label = "SCORE_NOW",
                explanation = Explanation(
                    positives = listOf("Priced low in the \$500–\$3500 window", "Very fresh listing", "Toyota — holds value on Kauaʻi", "Seller says it runs and drives", "Registration current (per seller)", "Located on Kauaʻi (Līhuʻe)"),
                    watchouts = listOf("Mentioned: starter")
                ))
        ),
        Listing(
            id = "lst_2",
            sourceId = "facebook",
            canonicalUrl = "https://www.facebook.com/marketplace/item/1002",
            title = "FREE lumber - curb alert Kapaa",
            description = "Free lumber and plywood, curb alert. First come first served, you haul. Must go today.",
            price = 0.0,
            town = "Kapaʻa",
            facts = Facts(category = "free", isFree = true),
            score = Score(overall = 85, price = 30, freshness = 25, category = 11, location = 10, keyword = 3, label = "GREAT_FIND",
                explanation = Explanation(positives = listOf("Free item", "Very fresh listing", "Located on Kauaʻi (Kapaʻa)")))
        ),
        Listing(
            id = "lst_3",
            sourceId = "craigslist",
            canonicalUrl = "https://honolulu.craigslist.org/kau/mcy/2002.html",
            title = "Yamaha dual sport 250 - Kapaa",
            description = "Yamaha dual sport, 250cc. Runs and drives great. Current registration and safety.",
            price = 2100.0,
            town = "Kapaʻa",
            facts = Facts(category = "motorcycle", make = "Yamaha", runningStatus = "runs_and_drives", registrationStatus = "current"),
            score = Score(overall = 76, price = 20, freshness = 25, category = 11, condition = 10, location = 10, label = "GREAT_FIND",
                explanation = Explanation(positives = listOf("Fresh listing", "Seller says it runs and drives", "Registration current (per seller)", "Located on Kauaʻi (Kapaʻa)")))
        ),
    )
}
