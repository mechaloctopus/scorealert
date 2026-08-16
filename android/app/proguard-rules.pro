# Moshi / Retrofit model classes are accessed reflectively.
-keep class com.scorealert.app.model.** { *; }
-keepclassmembers class com.scorealert.app.model.** { *; }

# Retrofit
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-dontwarn okhttp3.**
-dontwarn retrofit2.**
