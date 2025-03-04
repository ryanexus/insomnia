
set -e

VERSION=$(jq .version ./packages/insomnia/package.json -rj)
echo "Starting Insomnia secure wrapper build for version $VERSION..."
MAJOR=$(echo $VERSION | cut -d '.' -f 1)
MINOR=$(echo $VERSION | cut -d '.' -f 2)
PATCH=$(echo $VERSION | cut -d '.' -f 3 | cut -d '-' -f 1)
TAG=$(echo $VERSION | cut -d '-' -f 2)
SRC_DIR=packages/insomnia/src
CPP_DIR=windows
DEST_DIR=packages/insomnia/dist/win-unpacked

if [ -n "$TAG" ]; then
  TAG="-$TAG"
fi

# this takes too long, try the other way around
if [ ! $1 ]; then
  echo "Building Insomnia electron application..."
  npm run package:windows:unpacked -w insomnia
fi

cp $DEST_DIR/Insomnia.exe $CPP_DIR/resource.exe
cp $SRC_DIR/icons/icon.ico $CPP_DIR/insomnia.ico

echo "Injecting version strings..."
sed "s/__MAJOR__/$MAJOR/g" $CPP_DIR/resources.rc > $CPP_DIR/final.rc
sed -i "s/__MINOR__/$MINOR/g" $CPP_DIR/final.rc
sed -i "s/__PATCH__/$PATCH/g" $CPP_DIR/final.rc
sed -i "s/__TAG__/$TAG/g" $CPP_DIR/final.rc
sed -i "s/__YEAR__/$(date +%Y)/g" $CPP_DIR/final.rc

echo "Compiling resources..."
windres $CPP_DIR/final.rc $CPP_DIR/res.o

echo "Compiling Insomnia..."
g++  -o $CPP_DIR/insomnia.o -c $CPP_DIR/insomnia.cpp

echo "Linking Insomnia..."
g++ -O2 -o $DEST_DIR/Insomnia.exe $CPP_DIR/insomnia.o $CPP_DIR/res.o -lkernel32 -lole32 -lrpcrt4 -mwindows

echo "Secure wapper built successfully."

echo "Packaging distributables..."
npm run package:windows:dist -w insomnia

echo "Resetting state for repeat run..."
cp $CPP_DIR/resource.exe $DEST_DIR/Insomnia.exe
