#import <Foundation/Foundation.h>
int main(){@autoreleasepool {
 NSDictionary *value=@{@"thermalState":@([NSProcessInfo processInfo].thermalState)};
 NSData *data=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
 fwrite(data.bytes,1,data.length,stdout);puts("");return 0;
}}
